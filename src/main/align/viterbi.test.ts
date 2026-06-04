import { describe, expect, it } from 'vitest'
import { type Emission, forcedAlign } from './viterbi'

// vocab: 0=blank, 1='a', 2='b'
// 로그 확률을 흉내내기 위해 큰 값=확신, 작은 값=낮음.
function ln(p: number): number {
  return Math.log(Math.max(p, 1e-9))
}

/** 프레임별로 [blank, a, b] 확률을 받아 emission 생성 */
function makeEmission(rows: [number, number, number][]): Emission {
  const frames = rows.length
  if (frames === 0) {
    return {
      logits: new Float32Array(0),
      rowLogSumExps: new Float32Array(0),
      frames: 0,
      vocabSize: 0
    }
  }
  const vocabSize = rows[0].length
  const logits = new Float32Array(frames * vocabSize)
  const rowLogSumExps = new Float32Array(frames)

  for (let t = 0; t < frames; t++) {
    const row = rows[t]
    let max = -Infinity
    for (let c = 0; c < vocabSize; c++) {
      const val = ln(row[c])
      logits[t * vocabSize + c] = val
      if (val > max) max = val
    }
    let sumExp = 0
    for (let c = 0; c < vocabSize; c++) {
      sumExp += Math.exp(logits[t * vocabSize + c] - max)
    }
    rowLogSumExps[t] = max + Math.log(sumExp)
  }

  return {
    logits,
    rowLogSumExps,
    frames,
    vocabSize
  }
}

function makeLegacyEmission(rows: [number, number, number][]): number[][] {
  return rows.map((row) => {
    const logRow = row.map(ln)
    const max = Math.max(...logRow)
    const logSum = max + Math.log(logRow.reduce((sum, value) => sum + Math.exp(value - max), 0))
    return logRow.map((value) => value - logSum)
  })
}

function forcedAlignReference(
  emission: number[][],
  tokens: number[],
  blank = 0
): { token: number; startFrame: number; endFrame: number }[] {
  if (emission.length === 0 || tokens.length === 0) return []
  const trellis: number[][] = Array.from({ length: emission.length + 1 }, () =>
    new Array<number>(tokens.length + 1).fill(-Infinity)
  )
  trellis[0][0] = 0

  for (let t = 0; t < emission.length; t++) {
    for (let j = 0; j <= tokens.length; j++) {
      const prev = trellis[t][j]
      if (prev === -Infinity) continue
      trellis[t + 1][j] = Math.max(trellis[t + 1][j], prev + emission[t][blank])
      if (j < tokens.length) {
        trellis[t + 1][j + 1] = Math.max(trellis[t + 1][j + 1], prev + emission[t][tokens[j]])
      }
    }
  }

  const path: { frame: number; tokenIndex: number; isBlank: boolean }[] = []
  let j = tokens.length
  for (let t = emission.length; t > 0; t--) {
    const stayScore = trellis[t - 1][j] + emission[t - 1][blank]
    const advanceScore = j > 0 ? trellis[t - 1][j - 1] + emission[t - 1][tokens[j - 1]] : -Infinity
    const advanced = advanceScore > stayScore
    path.push({ frame: t - 1, tokenIndex: j - 1, isBlank: !advanced })
    if (advanced) j -= 1
    if (j === 0) break
  }
  path.reverse()

  const spans: { token: number; startFrame: number; endFrame: number }[] = []
  let current: { tokenIndex: number; startFrame: number; endFrame: number } | null = null
  for (const step of path) {
    if (step.isBlank) {
      if (current) current.endFrame = step.frame + 1
      continue
    }
    if (!current || current.tokenIndex !== step.tokenIndex) {
      if (current) {
        spans.push({
          token: tokens[current.tokenIndex],
          startFrame: current.startFrame,
          endFrame: current.endFrame
        })
      }
      current = { tokenIndex: step.tokenIndex, startFrame: step.frame, endFrame: step.frame + 1 }
    } else {
      current.endFrame = step.frame + 1
    }
  }
  if (current) {
    spans.push({
      token: tokens[current.tokenIndex],
      startFrame: current.startFrame,
      endFrame: current.endFrame
    })
  }
  return spans
}

describe('forcedAlign', () => {
  it('빈 입력은 빈 결과를 낸다', () => {
    const emptyEmission: Emission = {
      logits: new Float32Array(0),
      rowLogSumExps: new Float32Array(0),
      frames: 0,
      vocabSize: 0
    }
    expect(forcedAlign(emptyEmission, [1])).toEqual([])
    expect(forcedAlign(makeEmission([[1, 0, 0]]), [])).toEqual([])
  })

  it('단일 토큰을 해당 프레임에 정렬한다', () => {
    const emission = makeEmission([
      [0.1, 0.9, 0.0], // a
      [0.1, 0.9, 0.0] // a
    ])
    const spans = forcedAlign(emission, [1])
    expect(spans).toHaveLength(1)
    expect(spans[0].token).toBe(1)
    expect(spans[0].startFrame).toBe(0)
    expect(spans[0].endFrame).toBe(2)
    expect(spans[0].score).toBeGreaterThan(0.8)
  })

  it('두 토큰을 시간 순서대로 분리 정렬한다 (blank 흡수)', () => {
    const emission = makeEmission([
      [0.05, 0.9, 0.05], // a
      [0.8, 0.1, 0.1], // blank
      [0.05, 0.05, 0.9], // b
      [0.05, 0.05, 0.9] // b
    ])
    const spans = forcedAlign(emission, [1, 2])
    expect(spans.map((s) => s.token)).toEqual([1, 2])
    const [a, b] = spans
    expect(a.startFrame).toBe(0)
    expect(b.endFrame).toBe(4)
    // a 구간은 b 구간보다 먼저 끝난다
    expect(a.endFrame).toBeLessThanOrEqual(b.startFrame)
  })

  it('flat emission 최적화 후에도 2차원 reference DP와 같은 span을 낸다', () => {
    const rows: [number, number, number][] = [
      [0.7, 0.25, 0.05],
      [0.05, 0.9, 0.05],
      [0.8, 0.1, 0.1],
      [0.05, 0.15, 0.8],
      [0.6, 0.1, 0.3]
    ]
    const tokens = [1, 2]

    const spans = forcedAlign(makeEmission(rows), tokens).map(
      ({ token, startFrame, endFrame }) => ({
        token,
        startFrame,
        endFrame
      })
    )

    expect(spans).toEqual(forcedAlignReference(makeLegacyEmission(rows), tokens))
  })
})
