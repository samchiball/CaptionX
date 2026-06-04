import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveFfmpegPath } from './decode'

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

/** Chromium 미디어 엘리먼트가 안정적으로 읽는 preview 출력 포맷. */
const PREVIEW_EXT = 'm4a'

/** 지정 오디오 트랙(미지정 시 0:a:0)을 브라우저 호환 AAC/m4a로 추출하는 인자. */
function previewAudioArgs(trackIndex?: number): string[] {
  return [
    '-map',
    `0:a:${trackIndex ?? 0}`,
    '-vn',
    '-sn',
    '-dn',
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-movflags',
    '+faststart',
    '-f',
    'mp4'
  ]
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
  trackIndex?: number
): Promise<void> {
  const tmp = join(dir, `.${baseKey}.${randomUUID()}.part`)
  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        filePath,
        ...previewAudioArgs(trackIndex),
        tmp
      ]
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
  const baseKey = cacheKey(filePath, info.size, info.mtimeMs, trackIndex)
  const out = join(dir, `${baseKey}.${PREVIEW_EXT}`)
  if (await exists(out)) return out
  await extractAudio(filePath, out, dir, baseKey, trackIndex)
  return out
}
