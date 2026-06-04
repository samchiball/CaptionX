import { describe, expect, it } from 'vitest'
import { parseTimecode } from './timecode'

describe('parseTimecode', () => {
  it('점 구분자 타임코드를 초로 파싱한다', () => {
    expect(parseTimecode('00:00:00.000')).toBeCloseTo(0, 5)
    expect(parseTimecode('00:00:01.750')).toBeCloseTo(1.75, 5)
    expect(parseTimecode('01:01:01.234')).toBeCloseTo(3661.234, 5)
  })

  it('콤마 구분자도 파싱한다', () => {
    expect(parseTimecode('00:00:02,500')).toBeCloseTo(2.5, 5)
  })

  it('밀리초 자릿수가 부족하면 보정한다', () => {
    expect(parseTimecode('00:00:01.5')).toBeCloseTo(1.5, 5)
    expect(parseTimecode('00:00:01.05')).toBeCloseTo(1.05, 5)
  })

  it('형식에 맞지 않으면 0을 반환한다', () => {
    expect(parseTimecode('garbage')).toBe(0)
    expect(parseTimecode('')).toBe(0)
  })
})
