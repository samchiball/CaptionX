import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolveFfmpegPath } from './decode'

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

const inFlightWaveforms = new Map<string, Promise<number[]>>()

/**
 * 오디오 캐시 파일에서 100Hz로 피크 데이터를 추출하고, 지정된 개수(기본 2000개)로 다운샘플링하여 반환한다.
 * 결과는 .waveform.json 파일에 캐시되어 다음 요청 시 즉시 반환된다.
 */
export async function getWaveform(audioPath: string, pointsCount = 2000): Promise<number[]> {
  const waveformPath = `${audioPath}.waveform.json`
  if (await exists(waveformPath)) {
    try {
      const data = await readFile(waveformPath, 'utf8')
      return JSON.parse(data)
    } catch (err) {
      console.error('[waveform] Failed to read waveform cache, regenerating...', err)
    }
  }

  let promise = inFlightWaveforms.get(waveformPath)
  if (!promise) {
    promise = (async () => {
      try {
        const peaks = await extractPeaks(audioPath, pointsCount)
        try {
          await writeFile(waveformPath, JSON.stringify(peaks), 'utf8')
        } catch (err) {
          console.error('[waveform] Failed to write waveform cache:', err)
        }
        return peaks
      } finally {
        inFlightWaveforms.delete(waveformPath)
      }
    })()
    inFlightWaveforms.set(waveformPath, promise)
  }
  return promise
}

/**
 * ffmpeg를 이용하여 오디오 파일을 100Hz 모노 Float32 PCM 스트림으로 변환하고,
 * 각 시간 슬롯의 최대 피크 절대값을 계산한다.
 */
function extractPeaks(audioPath: string, pointsCount: number): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const ffmpeg = resolveFfmpegPath()
    const args = [
      '-hide_banner',
      '-i',
      audioPath,
      '-vn',
      '-ac',
      '1', // Mono
      '-ar',
      '100', // 100Hz (100 samples per second)
      '-f',
      'f32le', // Raw 32-bit Float Little Endian PCM
      'pipe:1'
    ]

    const proc = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks: Buffer[] = []
    let stderr = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', reject)

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg waveform extraction failed (code ${code}): ${stderr.trim()}`))
        return
      }

      const buf = Buffer.concat(chunks)
      const len = Math.floor(buf.byteLength / 4)
      if (len === 0) {
        resolve(new Array(pointsCount).fill(0))
        return
      }

      let samples: Float32Array
      if (buf.byteOffset % 4 === 0 && buf.byteLength % 4 === 0) {
        samples = new Float32Array(buf.buffer, buf.byteOffset, len)
      } else {
        const alignedBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        samples = new Float32Array(alignedBuffer, 0, len)
      }

      const peaks: number[] = []
      const step = len / pointsCount

      for (let i = 0; i < pointsCount; i++) {
        const start = Math.floor(i * step)
        const end = Math.floor((i + 1) * step)
        let max = 0

        if (start === end) {
          max = Math.abs(samples[Math.min(len - 1, start)])
        } else {
          for (let j = start; j < Math.min(len, end); j++) {
            const val = Math.abs(samples[j])
            if (val > max) max = val
          }
        }
        peaks.push(Math.round(max * 1000) / 1000)
      }

      // Max 정규화 (최대 피크가 1.0이 되도록 비율 조정)
      const maxPeak = Math.max(...peaks)
      if (maxPeak > 0) {
        for (let i = 0; i < peaks.length; i++) {
          peaks[i] = Math.round((peaks[i] / maxPeak) * 1000) / 1000
        }
      }

      resolve(peaks)
    })
  })
}
