import { describe, expect, it } from 'vitest'
import { tokenize, type Vocab } from './tokenizer'

describe('tokenize', () => {
  it('영어 대문자 vocab에서 단어를 문자 토큰으로 나누고 delimiter를 삽입한다', () => {
    const vocab: Vocab = { '<pad>': 0, '|': 1, A: 2, B: 3, C: 4 }
    const { tokens, wordOfToken, words } = tokenize('ab c', vocab)
    expect(words).toEqual(['ab', 'c'])
    expect(tokens).toEqual([2, 3, 1, 4]) // A B | C (소문자→대문자)
    expect(wordOfToken).toEqual([0, 0, -1, 1])
  })

  it('음절 단위 vocab은 음절을 그대로 매핑한다 (한국어 kresnik 스타일)', () => {
    const vocab: Vocab = { '[PAD]': 0, '|': 1, 안: 2, 녕: 3 }
    const { tokens, words } = tokenize('안녕', vocab)
    expect(words).toEqual(['안녕'])
    expect(tokens).toEqual([2, 3])
  })

  it('자모 단위 vocab은 음절을 NFD로 분해해 매핑한다 (한글 자소)', () => {
    // ㅇ ㅏ ㄴ ㄴ ㅕ ㅇ (NFD 분해된 자모)
    const vocab: Vocab = {
      '[PAD]': 0,
      '|': 1,
      ㅇ: 2,
      ㅏ: 3,
      ㄴ: 4,
      ㅕ: 5
    }
    const { tokens, words } = tokenize('안녕', vocab)
    expect(words).toEqual(['안녕'])
    // 안 = ㅇㅏㄴ, 녕 = ㄴㅕㅇ
    expect(tokens).toEqual([2, 3, 4, 4, 5, 2])
  })

  it('매핑 불가능한 문자만 있는 단어는 제외한다', () => {
    const vocab: Vocab = { '<pad>': 0, '|': 1, A: 2 }
    const { words } = tokenize('a ☆☆', vocab)
    expect(words).toEqual(['a'])
  })

  it('소문자만 있는 vocab(MMS 등)에서 대소문자가 혼용된 영어 텍스트를 정상 토큰화한다', () => {
    const vocab: Vocab = { '<pad>': 0, a: 1, b: 2, c: 3 }
    const { tokens, wordOfToken, words } = tokenize('Ab C', vocab)
    expect(words).toEqual(['Ab', 'C'])
    // A->a(1), b->b(2), C->c(3)
    // 단어 구분자 | 가 없으므로 tokens에는 구분자 없이 들어간다.
    expect(tokens).toEqual([1, 2, 3])
    expect(wordOfToken).toEqual([0, 0, 1])
  })

  it('라틴 문자만 있는 vocab(MMS 등)에서 한국어 텍스트를 로마자 변환하여 정상 토큰화 및 매핑한다', () => {
    // 안녕 -> annyeong
    // a(1), n(2), y(3), e(4), o(5), g(6)
    const vocab: Vocab = { '<pad>': 0, a: 1, n: 2, y: 3, e: 4, o: 5, g: 6 }
    const { tokens, wordOfToken, words } = tokenize('안녕', vocab)
    expect(words).toEqual(['안녕'])
    expect(tokens).toEqual([1, 2, 2, 3, 4, 5, 2, 6]) // a n n y e o n g
    expect(wordOfToken).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('라틴 문자만 있는 vocab(MMS 등)에서 일본어 가나 텍스트를 로마자 변환하여 정상 토큰화 및 매핑한다', () => {
    // きゃ -> kya (k:3, y:1, a:2)
    const vocab: Vocab = { '<pad>': 0, y: 1, a: 2, k: 3 }
    const { tokens, wordOfToken, words } = tokenize('きゃ', vocab)
    expect(words).toEqual(['きゃ'])
    expect(tokens).toEqual([3, 1, 2]) // k y a
    expect(wordOfToken).toEqual([0, 0, 0])
  })

  it('디아크리틱(악센트)이 포함된 라틴 텍스트를 일반 ASCII로 정규화하여 토큰화한다', () => {
    // Élément -> element
    const vocab: Vocab = { '<pad>': 0, e: 1, l: 2, m: 3, n: 4, t: 5 }
    const { tokens, words } = tokenize('Élément', vocab)
    expect(words).toEqual(['Élément'])
    expect(tokens).toEqual([1, 2, 1, 3, 1, 4, 5]) // e l e m e n t
  })
})
