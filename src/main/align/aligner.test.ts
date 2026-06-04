import { describe, expect, it } from 'vitest'
import { alignWords } from './aligner'
import { tokenize, type Vocab } from './tokenizer'
import type { Emission } from './viterbi'

// vocab: 0=blank(pad), 1='|', 2='a', 3='b', 4='c'
const vocab: Vocab = { '<pad>': 0, '|': 1, a: 2, b: 3, c: 4 }

function ln(p: number): number {
  return Math.log(Math.max(p, 1e-9))
}

describe('tokenize', () => {
  it('단어를 문자 토큰으로 나누고 구분자를 끼운다', () => {
    const { tokens, wordOfToken, words } = tokenize('ab c', vocab)
    expect(words).toEqual(['ab', 'c'])
    // a b | c
    expect(tokens).toEqual([2, 3, 1, 4])
    expect(wordOfToken).toEqual([0, 0, -1, 1])
  })

  it('vocab에 없는 문자는 건너뛴다', () => {
    const { tokens } = tokenize('aZb', vocab)
    expect(tokens).toEqual([2, 3]) // Z 제외
  })

  it('정렬 가능한 문자가 없는 단어는 제외한다', () => {
    const { words } = tokenize('a ZZZ b', vocab)
    expect(words).toEqual(['a', 'b'])
  })
})

describe('alignWords', () => {
  it('두 단어를 시간 구간으로 정렬한다', () => {
    // 프레임: a, |, c  (단어 "a" 프레임0, 구분자 프레임1, 단어 "c" 프레임2)
    const rows: [number, number, number, number, number][] = [
      [0.05, 0.05, 0.85, 0.0, 0.05], // a
      [0.05, 0.85, 0.05, 0.0, 0.05], // |
      [0.05, 0.05, 0.05, 0.0, 0.85] // c
    ]
    const frames = rows.length
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

    const emission: Emission = {
      logits,
      rowLogSumExps,
      frames,
      vocabSize
    }
    const frameToTime = (f: number): number => f * 0.1 // 프레임당 0.1초
    const words = alignWords(emission, 'a c', vocab, frameToTime, 0)

    expect(words.map((w) => w.text)).toEqual(['a', 'c'])
    expect(words[0].start).toBeCloseTo(0, 5)
    expect(words[1].start).toBeGreaterThanOrEqual(words[0].end)
    expect(words[1].end).toBeCloseTo(0.3, 5)
  })

  it('빈 텍스트는 빈 결과', () => {
    const emptyEmission: Emission = {
      logits: new Float32Array(0),
      rowLogSumExps: new Float32Array(0),
      frames: 0,
      vocabSize: 0
    }
    expect(alignWords(emptyEmission, '', vocab, (f) => f, 0)).toEqual([])
  })
})
