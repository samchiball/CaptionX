import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveFfmpegPath } from './decode'
import { probeAudioTracks } from './tracks'

/** 재생용 추출 오디오 캐시 루트 (userData/preview-cache) */
export function cacheDir(): string {
  return join(app.getPath('userData'), 'preview-cache')
}

/**
 * 원본 경로 + 크기 + 수정시각(+트랙 순번)으로 캐시 키를 만든다(내용 변경 시 무효화).
 * 트랙별 모니터링 시 트랙마다 다른 캐시를 만들도록 trackIndex를 키에 포함한다.
 */
function cacheKey(filePath: string, size: number, mtimeMs: number, trackIndex?: number): string {
  const trackPart = trackIndex !== undefined ? `:a${trackIndex}` : ''
  return createHash('sha256')
    .update(`${filePath}:${size}:${mtimeMs}${trackPart}`)
    .digest('hex')
    .slice(0, 32)
}

/** 파일 존재 여부 */
async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/**
 * Chromium 미디어 엘리먼트가 그대로 재생 가능한 코덱 → 리먹스 출력(확장자/컨테이너).
 * 여기 있는 코덱은 재인코딩 없이 `-c:a copy` 로 컨테이너만 바꿔(거의 즉시) 추출한다.
 * 비호환 코덱(ac3·dts·eac3·pcm 등)은 아래 ENCODE 폴백으로 AAC/m4a로 재인코딩한다.
 */
const COPYABLE: Record<string, { ext: string; format: string }> = {
  aac: { ext: 'm4a', format: 'mp4' },
  mp3: { ext: 'mp3', format: 'mp3' },
  flac: { ext: 'flac', format: 'flac' },
  opus: { ext: 'opus', format: 'ogg' },
  vorbis: { ext: 'ogg', format: 'ogg' }
}

/** 비호환 코덱 재인코딩 폴백 출력 확장자(안정적인 AAC/m4a). */
const ENCODE_EXT = 'm4a'

interface PreviewPlan {
  /** 출력 파일 확장자(캐시 파일명·MIME 결정). */
  ext: string
  /** ffmpeg 추출 인자(입력 `-i` 와 출력 경로 사이에 들어갈 부분). */
  args: string[]
}

/**
 * 선택 트랙의 코덱에 따라 추출 계획을 세운다(순수 함수).
 * 호환 코덱이면 `-c:a copy`(리먹스), 아니면 AAC 재인코딩으로 폴백한다.
 */
export function buildPreviewPlan(codec: string | undefined, trackIndex?: number): PreviewPlan {
  const map = ['-map', `0:a:${trackIndex ?? 0}`, '-vn', '-sn', '-dn']
  const copy = codec ? COPYABLE[codec] : undefined
  if (copy) {
    // faststart(moov 선두 배치)는 mp4 계열에만 의미가 있다.
    const movflags = copy.format === 'mp4' ? ['-movflags', '+faststart'] : []
    return { ext: copy.ext, args: [...map, '-c:a', 'copy', ...movflags, '-f', copy.format] }
  }
  return {
    ext: ENCODE_EXT,
    args: [...map, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-f', 'mp4']
  }
}

/**
 * 오디오 트랙만 브라우저 호환 AAC/m4a로 추출해 out에 쓴다.
 *
 * 임시 파일(.part)로 추출한 뒤 성공 시에만 원자적으로 옮긴다. 최종 경로에 바로
 * 쓰면 추출 도중 앱 종료/크래시 시 잘린(손상된) 파일이 캐시로 오인돼 다음 실행에서
 * 같은 지점에서 재생이 멈춘다.
 */
async function extractAudio(
  filePath: string,
  out: string,
  dir: string,
  baseKey: string,
  planArgs: string[]
): Promise<void> {
  const tmp = join(dir, `.${baseKey}.${randomUUID()}.part`)
  try {
    await new Promise<void>((resolve, reject) => {
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', filePath, ...planArgs, tmp]
      const proc = spawn(resolveFfmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
      let stderr = ''
      proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`오디오 추출 실패 (code ${code}): ${stderr.trim()}`))
      })
    })
    await rename(tmp, out)
  } catch (err) {
    await rm(tmp, { force: true }) // 실패 시 잘린 임시 파일 정리
    throw err
  }
}

const inFlightPreviews = new Map<string, Promise<string>>()

/**
 * 미디어의 오디오 트랙을 브라우저 호환 AAC/m4a로 추출한다.
 * 원본 컨테이너/코덱별 Chromium 지원 차이를 피하기 위해 preview 출력은 항상
 * 하나의 안정 포맷으로 고정한다. 결과는 트랙별로 캐시되어 재사용된다.
 *
 * @param trackIndex 추출할 오디오 트랙 순번(0부터). 미지정 시 첫 트랙(0:a:0).
 * @returns 추출된 오디오 절대 경로
 */
export async function preparePreviewAudio(filePath: string, trackIndex?: number): Promise<string> {
  const info = await stat(filePath)
  const dir = cacheDir()
  await mkdir(dir, { recursive: true })

  // 선택 트랙의 코덱을 조사해, 브라우저 호환이면 리먹스(copy)·아니면 재인코딩한다.
  // 조사 실패/범위 밖이면 안전하게 재인코딩(undefined 코덱)으로 폴백한다.
  let codec: string | undefined
  try {
    const tracks = await probeAudioTracks(filePath)
    codec = tracks[trackIndex ?? 0]?.codec
  } catch {
    codec = undefined
  }
  const plan = buildPreviewPlan(codec, trackIndex)

  // 캐시 파일명은 plan.ext 를 따른다(copy/encode·컨테이너가 바뀌면 자연히 분리됨).
  const baseKey = cacheKey(filePath, info.size, info.mtimeMs, trackIndex)
  const out = join(dir, `${baseKey}.${plan.ext}`)
  if (await exists(out)) return out

  let promise = inFlightPreviews.get(out)
  if (!promise) {
    promise = (async () => {
      try {
        await extractAudio(filePath, out, dir, baseKey, plan.args)
        return out
      } finally {
        inFlightPreviews.delete(out)
      }
    })()
    inFlightPreviews.set(out, promise)
  }
  return promise
}
