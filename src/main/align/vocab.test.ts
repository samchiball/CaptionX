import { describe, expect, it } from 'vitest'
import { blankOf, extractVocab, parseVocab } from './vocab'

describe('extractVocab', () => {
  it('평면 vocab.json은 그대로 반환한다', () => {
    const flat = { '<pad>': 0, '|': 4, a: 7 }
    expect(extractVocab(flat)).toBe(flat)
  })

  it('tokenizer.json은 model.vocab을 꺼낸다', () => {
    const tok = { version: '1.0', model: { type: 'WordLevel', vocab: { '[PAD]': 1204, '|': 859 } } }
    expect(extractVocab(tok)).toEqual({ '[PAD]': 1204, '|': 859 })
  })

  it('객체가 아니면 예외', () => {
    expect(() => extractVocab(null)).toThrow()
    expect(() => extractVocab(42)).toThrow()
  })
})

describe('blankOf', () => {
  it('<pad>를 우선 사용한다', () => {
    expect(blankOf({ '<pad>': 0, '|': 4 })).toBe(0)
  })

  it('[PAD] 표기도 인식한다', () => {
    expect(blankOf({ '[PAD]': 1204, '|': 859 })).toBe(1204)
  })

  it('pad 토큰이 없으면 0으로 가정한다', () => {
    expect(blankOf({ a: 1, b: 2 })).toBe(0)
  })
})

describe('parseVocab', () => {
  it('jonatasgrosman 스타일 vocab.json', () => {
    const { vocab, blank } = parseVocab(JSON.stringify({ '<pad>': 0, '|': 4, a: 7 }))
    expect(blank).toBe(0)
    expect(vocab['|']).toBe(4)
  })

  it('FinDIT 스타일 tokenizer.json ([PAD] blank)', () => {
    const raw = JSON.stringify({ model: { vocab: { '[PAD]': 1204, '|': 859, 가: 26 } } })
    const { vocab, blank } = parseVocab(raw)
    expect(blank).toBe(1204)
    expect(vocab.가).toBe(26)
  })
})
