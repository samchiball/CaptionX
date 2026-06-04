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

/** 원본 경로 + 크기 + 수정시각으로 캐시 키를 만든다(내용 변경 시 무효화). */
function cacheKey(filePath: string, size: number, mtimeMs: number): string {
  return createHash('sha256').update(`${filePath}:${size}:${mtimeMs}`).digest('hex').slice(0, 32)
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
 * ffmpeg stderr의 첫 오디오 스트림 줄("Stream #0:1...: Audio: aac (LC) ...")에서
 * 코덱명을 파싱한다(순수 함수). 오디오 스트림이 없으면 null.
 */
export function parseAudioCodec(stderr: string): string | null {
  const m = stderr.match(/Stream #\d+:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: Audio: (\w+)/)
  return m ? m[1].toLowerCase() : null
}

/**
 * 입력의 첫 오디오 스트림 코덱명을 알아낸다.
 * 별도 ffprobe 의존성 없이 ffmpeg `-i`만 실행해 stderr를 파싱한다
 * (출력 미지정이라 ffmpeg는 비정상 종료하지만 스트림 정보는 stderr에 남는다).
 * 입력이 없거나 코덱을 못 읽으면 null(→ 재인코딩 폴백).
 */
async function probeAudioCodec(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn(resolveFfmpegPath(), ['-hide_banner', '-i', filePath], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderr = ''
    proc.stderr.on('data', (c: Buffer) => (stderr += c.toString()))
    proc.on('error', () => resolve(null))
    proc.on('close', () => resolve(parseAudioCodec(stderr)))
  })
}

/** stream copy(remux) 계획: 출력 확장자 + ffmpeg 코덱/컨테이너 인자. */
export interface CopyPlan {
  ext: string
  args: string[]
}

/**
 * 코덱이 브라우저에서 바로 디코드 가능하면 재인코딩 없이 컨테이너만 바꾸는
 * stream copy 계획을 돌려준다(없으면 null → AAC 재인코딩).
 *
 * copy는 디스크 I/O뿐이라 장시간 파일도 거의 즉시 끝난다. 컨테이너는 해당
 * 코덱과 Chromium이 함께 지원하는 형식으로 고른다(aac→mp4, mp3→mp3,
 * flac→flac, opus/vorbis→ogg). 출력 확장자는 모두 MEDIA_EXTENSIONS에 속해
 * 미디어 프로토콜이 재생을 허용한다.
 */
export function copyPlanFor(codec: string | null): CopyPlan | null {
  switch (codec) {
    case 'aac':
      // moov를 선두로 옮겨 브라우저 스트리밍/seek가 즉시 가능하게 한다.
      return { ext: 'm4a', args: ['-c:a', 'copy', '-movflags', '+faststart', '-f', 'mp4'] }
    case 'mp3':
      return { ext: 'mp3', args: ['-c:a', 'copy', '-f', 'mp3'] }
    case 'flac':
      return { ext: 'flac', args: ['-c:a', 'copy', '-f', 'flac'] }
    case 'opus':
    case 'vorbis':
      return { ext: 'ogg', args: ['-c:a', 'copy', '-f', 'ogg'] }
    default:
      return null
  }
}

/** AAC 재인코딩 계획(브라우저 비호환 코덱 폴백). 항상 .m4a로 떨어진다. */
const REENCODE_PLAN: CopyPlan = {
  ext: 'm4a',
  args: ['-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-f', 'mp4']
}

/**
 * 주어진 ffmpeg 코덱/컨테이너 인자로 오디오 트랙만 추출해 out에 쓴다.
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
  codecArgs: string[]
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
        '-vn', // 비디오 트랙 제거
        ...codecArgs,
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
 * 미디어의 오디오 트랙만 브라우저에서 재생 가능한 형태로 추출한다.
 *
 * 원본 코덱이 이미 브라우저 호환(AAC/MP3/FLAC/Opus/Vorbis)이면 재인코딩 없이
 * 컨테이너만 바꾸는 stream copy로 추출한다. copy는 I/O 바운드라 장시간 파일도
 * 거의 즉시 끝나, "긴 영상은 한참 뒤에야/끝내 재생 불가" 문제를 없앤다.
 * 비호환 코덱만 AAC로 재인코딩하며, copy가 실패해도 재인코딩으로 폴백한다.
 * 결과는 캐시되어 재사용된다.
 *
 * @returns 추출된 오디오 절대 경로
 */
export async function preparePreviewAudio(filePath: string): Promise<string> {
  const info = await stat(filePath)
  const dir = cacheDir()
  await mkdir(dir, { recursive: true })
  const baseKey = cacheKey(filePath, info.size, info.mtimeMs)

  const plan = copyPlanFor(await probeAudioCodec(filePath))

  // copy 결과(plan.ext)와 재인코딩 폴백 결과(.m4a) 둘 다 캐시 후보로 확인한다.
  // 이전 실행에서 copy가 실패해 .m4a로 굳었어도 재추출 없이 재사용한다.
  const candidateExts =
    plan && plan.ext !== REENCODE_PLAN.ext ? [plan.ext, REENCODE_PLAN.ext] : ['m4a']
  for (const ext of candidateExts) {
    const cached = join(dir, `${baseKey}.${ext}`)
    if (await exists(cached)) return cached
  }

  // 호환 코덱이면 빠른 copy를 먼저 시도하고, 실패 시 AAC 재인코딩으로 폴백한다.
  if (plan) {
    const out = join(dir, `${baseKey}.${plan.ext}`)
    try {
      await extractAudio(filePath, out, dir, baseKey, plan.args)
      return out
    } catch {
      // copy 실패(컨테이너-코덱 비호환 등) → 재인코딩으로 폴백
    }
  }

  const out = join(dir, `${baseKey}.${REENCODE_PLAN.ext}`)
  await extractAudio(filePath, out, dir, baseKey, REENCODE_PLAN.args)
  return out
}
