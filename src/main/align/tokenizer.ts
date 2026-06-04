// wav2vec2 CTC 문자 단위 토크나이저.
// vocab: 문자→id 매핑. 단어 구분은 delimiter 토큰(보통 '|')으로 표현한다.

import { romanizeWord } from './romanize'

export type Vocab = Record<string, number>

export interface TokenizedTranscript {
  /** forcedAlign에 넣을 토큰 id 열 */
  tokens: number[]
  /** tokens[i]가 속한 단어 인덱스 (-1 이면 단어 구분자) */
  wordOfToken: number[]
  /** 원본 단어 텍스트 목록 */
  words: string[]
}

// 한글 호환 자모(U+31xx) 표. 한글 자모 vocab 모델은 보통 호환 자모를 사용한다.
const CHO = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ']
const JUNG = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ']
const JONG = [...' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']

/**
 * 한글 음절을 호환 자모(초성·중성·종성)로 분해한다. 음절이 아니면 null.
 * 유니코드 NFD는 조합형 자모(U+110x)를 내놓으므로, vocab과 맞추기 위해 직접 분해한다.
 */
function decomposeHangul(ch: string): string[] | null {
  const code = (ch.codePointAt(0) ?? 0) - 0xac00
  if (code < 0 || code > 11171) return null
  const cho = Math.floor(code / 588)
  const jung = Math.floor((code % 588) / 28)
  const jong = code % 28
  const out = [CHO[cho], JUNG[jung]]
  if (jong > 0) out.push(JONG[jong])
  return out
}

/**
 * 한 문자를 vocab id(들)로 매핑한다.
 * 1) vocab[ch] 직접 조회 (음절 단위 vocab: 한국어 kresnik, 영어 등).
 * 2) 한글 음절이면 호환 자모로 분해해 매핑 (한글 자모 vocab).
 * 3) NFD 분해 후 각 조각을 매핑 (합성형 라틴 é, 조합형 자모 vocab 등).
 * 4) 그래도 없는 조각은 건너뛴다.
 */
function charToIds(ch: string, vocab: Vocab, upper: boolean, lower: boolean): number[] {
  let c = ch
  if (upper) c = c.toUpperCase()
  else if (lower) c = c.toLowerCase()
  const direct = vocab[c]
  if (direct !== undefined) return [direct]

  const jamo = decomposeHangul(c)
  const parts = jamo ?? [...c.normalize('NFD')]
  const ids: number[] = []
  for (const part of parts) {
    const id = vocab[part]
    if (id !== undefined) ids.push(id)
  }
  return ids
}

/**
 * 어휘 사전(vocab)이 라틴 문자만 지원하는지 판단한다.
 * 비ASCII 문자(코드포인트 > 127)가 없으면 MMS와 같은 라틴 전용 모델로 간주하여 로마자 표기로 변환한다.
 */
function shouldRomanize(vocab: Vocab): boolean {
  for (const key of Object.keys(vocab)) {
    if (key.length === 1) {
      const code = key.charCodeAt(0)
      if (code > 127) {
        return false
      }
    }
  }
  return true
}

/**
 * 텍스트를 vocab 기준 문자 토큰열로 변환한다.
 * - 공백으로 단어를 나눈다.
 * - 각 문자를 vocab id로 매핑(대문자 vocab이면 대문자화, 음절이 없으면 자모로 분해).
 *   매핑 불가한 문자는 건너뛴다.
 * - 단어 사이에 delimiter 토큰을 넣어 단어 경계를 표시한다.
 */
export function tokenize(text: string, vocab: Vocab, delimiter = '|'): TokenizedTranscript {
  const delimiterId = vocab[delimiter]
  const upper = delimiter in vocab && 'A' in vocab // 대문자 vocab 휴리스틱
  const lower = 'a' in vocab // 소문자 vocab 휴리스틱
  const rawWords = text.trim().split(/\s+/).filter(Boolean)
  const isLatinOnly = shouldRomanize(vocab)

  const tokens: number[] = []
  const wordOfToken: number[] = []
  const words: string[] = []

  rawWords.forEach((word) => {
    const targetWord = isLatinOnly ? romanizeWord(word) : word
    const charIds: number[] = []
    for (const ch of targetWord) {
      charIds.push(...charToIds(ch, vocab, upper, lower))
    }
    if (charIds.length === 0) return // 정렬 가능한 문자가 없는 단어는 제외
    const wordIndex = words.length
    words.push(word) // 원본 단어 보존 (정렬 타임스탬프가 원본 단어에 연결되도록 함)
    if (tokens.length > 0 && delimiterId !== undefined) {
      tokens.push(delimiterId)
      wordOfToken.push(-1)
    }
    for (const id of charIds) {
      tokens.push(id)
      wordOfToken.push(wordIndex)
    }
  })

  return { tokens, wordOfToken, words }
}
