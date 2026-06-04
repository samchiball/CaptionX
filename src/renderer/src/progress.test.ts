import { describe, expect, it } from 'vitest'
import { estimateRemainingMs, formatDuration } from './progress'

describe('formatDuration', () => {
  it('1시간 미만은 M:SS로 표시한다', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(42)).toBe('0:42')
    expect(formatDuration(125)).toBe('2:05')
  })

  it('1시간 이상은 H:MM:SS로 표시한다', () => {
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(5025)).toBe('1:23:45')
  })

  it('음수·비유한 값은 0:00으로 본다', () => {
    expect(formatDuration(-10)).toBe('0:00')
    expect(formatDuration(NaN)).toBe('0:00')
    expect(formatDuration(Infinity)).toBe('0:00')
  })
})

describe('estimateRemainingMs', () => {
  it('경과와 진행률로 남은 시간을 선형 추정한다', () => {
    // 25% 진행에 10초 걸렸으면 나머지 75%는 30초 예상
    expect(estimateRemainingMs(10_000, 25)).toBe(30_000)
  })

  it('진행률이 0 이하·100 이상이면 추정 불가', () => {
    expect(estimateRemainingMs(10_000, 0)).toBeNull()
    expect(estimateRemainingMs(10_000, 100)).toBeNull()
    expect(estimateRemainingMs(10_000, -5)).toBeNull()
  })

  it('경과가 음수·비유한 값이면 추정 불가', () => {
    expect(estimateRemainingMs(-1, 50)).toBeNull()
    expect(estimateRemainingMs(NaN, 50)).toBeNull()
  })
})
