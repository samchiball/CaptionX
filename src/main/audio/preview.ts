import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveFfmpegPath } from './decode'

/** 재생용 추출 오디오 캐시 루트 (userData/preview-cache) */
function cacheDir(): string {
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
 * 미디어의 오디오 트랙만 브라우저 호환 m4a(AAC)로 추출한다.
 * 원본 영상 코덱/픽셀 포맷이 Chromium에서 디코드 불가여도 타이밍 검증용
 * 오디오 재생이 가능하도록 보장한다. 결과는 캐시되어 재사용된다.
 * @returns 추출된 m4a 절대 경로
 */
export async function preparePreviewAudio(filePath: string): Promise<string> {
  const info = await stat(filePath)
  const dir = cacheDir()
  await mkdir(dir, { recursive: true })
  const out = join(dir, `${cacheKey(filePath, info.size, info.mtimeMs)}.m4a`)

  if (await exists(out)) return out

  // 임시 파일로 추출한 뒤 성공 시에만 원자적으로 캐시 경로로 옮긴다.
  // 최종 경로에 바로 쓰면 추출 도중 앱 종료/크래시 시 잘린(손상된) m4a가 남고,
  // 다음 실행에서 그 파일을 캐시로 오인해 재사용 → 같은 지점에서 재생이 멈춘다.
  const tmp = join(dir, `.${cacheKey(filePath, info.size, info.mtimeMs)}.${randomUUID()}.part`)
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
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-movflags',
        '+faststart', // 브라우저 스트리밍/seek용 moov 선두 배치
        '-f',
        'mp4', // 임시 파일 확장자(.part)로는 포맷 추론이 안 되므로 명시
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

  return out
}
