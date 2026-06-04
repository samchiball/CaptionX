import { describe, expect, it } from 'vitest'
import { PCM_BYTES_PER_SECOND, parseDurationSec, TARGET_SAMPLE_RATE } from './decode'

describe('parseDurationSec', () => {
  it('ffmpeg Duration 줄에서 총 길이를 초로 파싱한다', () => {
    const stderr = [
      "Input #0, mov,mp4, from 'movie.mp4':",
      '  Duration: 01:23:45.67, start: 0.000000, bitrate: 128 kb/s',
      '  Stream #0:0: Audio: aac'
    ].join('\n')
    // 1시간 23분 45.67초
    expect(parseDurationSec(stderr)).toBeCloseTo(3600 + 23 * 60 + 45.67, 2)
  })

  it('소수 밀리초가 없어도 파싱한다', () => {
    expect(parseDurationSec('  Duration: 00:00:42, start: 0')).toBe(42)
  })

  it('Duration 줄이 없으면 null', () => {
    expect(parseDurationSec('garbage without duration')).toBeNull()
    expect(parseDurationSec('  Duration: N/A, start: 0')).toBeNull()
  })
})

describe('PCM_BYTES_PER_SECOND', () => {
  it('16kHz mono f32le의 초당 바이트 수와 일치한다', () => {
    expect(PCM_BYTES_PER_SECOND).toBe(TARGET_SAMPLE_RATE * 4)
    expect(PCM_BYTES_PER_SECOND).toBe(64000)
  })
})
