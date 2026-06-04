import { spawn } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveFfmpegPath } from './decode'
import { getWaveform } from './waveform'

const USER_DATA = join(tmpdir(), `captionx-waveform-test-${process.pid}`)

/** 테스트용 작은 오디오(wav)를 생성한다. */
async function makeSampleAudio(path: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      resolveFfmpegPath(),
      ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=duration=5', path],
      { stdio: ['ignore', 'ignore', 'ignore'] }
    )
    proc.on('error', reject)
    proc.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`sample gen failed ${c}`))))
  })
}

describe('getWaveform', () => {
  let sample: string

  beforeAll(async () => {
    const { mkdir, rm } = await import('node:fs/promises')
    await rm(USER_DATA, { recursive: true, force: true })
    await mkdir(USER_DATA, { recursive: true })
    sample = join(USER_DATA, 'sample.wav')
    await makeSampleAudio(sample)
  }, 30000)

  afterAll(async () => {
    const { rm } = await import('node:fs/promises')
    await rm(USER_DATA, { recursive: true, force: true })
  })

  it('오디오 파일의 피크 데이터를 지정된 개수만큼 추출하고 정규화한다', async () => {
    const pointsCount = 100
    const peaks = await getWaveform(sample, pointsCount)

    expect(peaks).toBeInstanceOf(Array)
    expect(peaks).toHaveLength(pointsCount)

    // 최대 피크가 1.0으로 정규화되었는지 확인
    const maxVal = Math.max(...peaks)
    expect(maxVal).toBeCloseTo(1.0, 2)

    // 모든 값은 0.0과 1.0 사이에 있어야 함
    for (const val of peaks) {
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThanOrEqual(1)
    }

    // 캐시 파일 생성 확인
    const cacheFile = `${sample}.waveform.json`
    const cacheStat = await stat(cacheFile)
    expect(cacheStat.size).toBeGreaterThan(0)

    // 캐시 파일 내용 검증
    const cacheContent = await readFile(cacheFile, 'utf8')
    const parsed = JSON.parse(cacheContent)
    expect(parsed).toEqual(peaks)
  }, 30000)

  it('캐시가 존재하면 두 번째 호출 시 캐시 파일을 즉시 읽어온다', async () => {
    // 첫 호출로 캐시 생성
    const peaks1 = await getWaveform(sample, 50)
    // 두 번째 호출
    const peaks2 = await getWaveform(sample, 50)

    expect(peaks1).toEqual(peaks2)
  }, 30000)
})
