import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { CancellationError } from '../cancellation'

const require = createRequire(import.meta.url)

/** ffmpeg-static 바이너리 경로. 패키징 시 asar.unpacked 경로로 보정한다. */
export function resolveFfmpegPath(): string {
  // ffmpeg-static는 바이너리 절대 경로(string)를 default export 한다.
  const raw = require('ffmpeg-static') as string
  // electron asar 패키징 시 app.asar → app.asar.unpacked 로 치환
  return raw.replace('app.asar', 'app.asar.unpacked')
}

export const TARGET_SAMPLE_RATE = 16000

/** 16kHz mono f32le PCM의 초당 바이트 수(16000 샘플 × 4바이트). 디코드 진행률 환산용. */
export const PCM_BYTES_PER_SECOND = TARGET_SAMPLE_RATE * 4

/** 디코드 진행 콜백: 지금까지 디코드한 오디오 길이(초)와 전체 길이(초, 미상이면 null). */
export type DecodeProgress = { processedSec: number; totalSec: number | null }

/**
 * ffmpeg stderr의 "Duration: HH:MM:SS.ms" 줄에서 총 길이를 초로 파싱한다(순수 함수).
 * 길이를 알 수 없는 스트림(라이브 등)이거나 형식이 어긋나면 null.
 */
export function parseDurationSec(stderr: string): number | null {
  const m = stderr.match(/Duration:\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/)
  if (!m) return null
  const [, h, mm, ss, frac] = m
  const fracSec = frac ? Number(`0.${frac}`) : 0
  const total = Number(h) * 3600 + Number(mm) * 60 + Number(ss) + fracSec
  return Number.isFinite(total) ? total : null
}

/**
 * 입력 미디어(오디오/비디오)를 16kHz mono Float32 PCM 샘플로 디코드한다.
 * whisper.cpp / wav2vec2 모두 16kHz mono를 입력으로 받는다.
 *
 * onProgress가 주어지면 장시간 파일의 디코드 진행을 모니터링할 수 있도록,
 * 생성된 PCM 바이트로 환산한 처리 길이(초)를 주기적으로 보고한다.
 */
export async function decodeToPcm(
  filePath: string,
  onProgress?: (p: DecodeProgress) => void,
  signal?: AbortSignal,
  trackIndex?: number
): Promise<Float32Array> {
  if (signal?.aborted) throw new CancellationError()

  return new Promise((resolve, reject) => {
    const ffmpeg = resolveFfmpegPath()
    const args = [
      '-hide_banner',
      '-i',
      filePath,
      // 멀티트랙 영상에서 특정 오디오 트랙만 디코드한다(미지정 시 ffmpeg 기본 트랙).
      ...(trackIndex !== undefined ? ['-map', `0:a:${trackIndex}`] : []),
      '-vn', // 비디오 무시
      '-ac',
      '1', // mono
      '-ar',
      String(TARGET_SAMPLE_RATE),
      '-f',
      'f32le', // 32-bit float little-endian raw PCM
      'pipe:1'
    ]
    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    const chunks: Buffer[] = []
    let stderr = ''
    let bytes = 0
    let lastReportedSec = -1
    let aborted = false
    let totalSec: number | null = null

    // 취소 시 ffmpeg 프로세스를 즉시 죽이고 누적 버퍼를 비워 메모리를 회수한다.
    const onAbort = (): void => {
      aborted = true
      chunks.length = 0
      proc.kill('SIGKILL')
    }
    if (signal) {
      if (signal.aborted) {
        onAbort()
        reject(new CancellationError())
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    proc.stdout.on('data', (c: Buffer) => {
      chunks.push(c)
      if (!onProgress) return
      bytes += c.byteLength
      // 1초 단위 변화일 때만 보고해 이벤트 폭주를 막는다.
      const processedSec = Math.floor(bytes / PCM_BYTES_PER_SECOND)
      if (processedSec !== lastReportedSec) {
        lastReportedSec = processedSec
        onProgress({ processedSec, totalSec })
      }
    })
    proc.stderr.on('data', (c: Buffer) => {
      const str = c.toString()
      stderr += str
      if (onProgress && totalSec === null) {
        totalSec = parseDurationSec(stderr)
      }
    })
    proc.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      reject(aborted ? new CancellationError() : err)
    })
    proc.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (aborted) {
        reject(new CancellationError())
        return
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg 디코드 실패 (code ${code}): ${stderr.trim()}`))
        return
      }
      const buf = Buffer.concat(chunks)
      // Buffer → Float32Array (바이트 정렬이 보장되면 복사 없이 즉시 반환)
      let samples: Float32Array
      if (buf.byteOffset % 4 === 0 && buf.byteLength % 4 === 0) {
        samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
      } else {
        const alignedBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        samples = new Float32Array(alignedBuffer)
      }
      resolve(samples)
    })
  })
}
