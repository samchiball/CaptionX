import { describe, expect, it } from 'vitest'
import { normalizePcm, parseDoNormalize } from './feature'

describe('parseDoNormalize', () => {
  it('설정에 true가 있으면 true', () => {
    expect(parseDoNormalize('{"do_normalize": true}')).toBe(true)
  })

  it('설정에 false가 있으면 false (영어 base-960h 등)', () => {
    expect(parseDoNormalize('{"do_normalize": false, "feature_size": 1}')).toBe(false)
  })

  it('필드가 없으면 기본 true', () => {
    expect(parseDoNormalize('{"feature_size": 1}')).toBe(true)
  })

  it('잘못된 JSON이면 기본 true', () => {
    expect(parseDoNormalize('not json')).toBe(true)
  })
})

describe('normalizePcm', () => {
  it('출력 평균은 0, 표준편차는 1에 근접한다', () => {
    const pcm = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])
    const out = normalizePcm(pcm)
    let mean = 0
    for (const v of out) mean += v
    mean /= out.length
    let variance = 0
    for (const v of out) variance += (v - mean) ** 2
    variance /= out.length
    expect(Math.abs(mean)).toBeLessThan(1e-5)
    expect(Math.abs(Math.sqrt(variance) - 1)).toBeLessThan(1e-3)
  })

  it('상수 입력에도 NaN 없이 0 근방을 반환한다', () => {
    const out = normalizePcm(new Float32Array([0.5, 0.5, 0.5, 0.5]))
    for (const v of out) expect(Number.isFinite(v)).toBe(true)
  })

  it('빈 입력은 그대로 반환한다', () => {
    expect(normalizePcm(new Float32Array(0)).length).toBe(0)
  })
})
