import type { Word } from '@shared/types'
import { tokenize, type Vocab } from './tokenizer'
import { type Emission, forcedAlign } from './viterbi'

/** 프레임 인덱스 → 초. */
export type FrameToTime = (frame: number) => number

/**
 * emission과 전사 텍스트로부터 단어 레벨 타임스탬프를 만든다 (순수 함수).
 * @param emission frames × vocab 로그확률
 * @param text 정렬할 텍스트(보통 Whisper 세그먼트 텍스트)
 * @param vocab wav2vec2 문자 vocab
 * @param frameToTime 프레임→초 변환 (세그먼트 로컬 시간)
 * @param blank CTC blank 토큰 id
 */
export function alignWords(
  emission: Emission,
  text: string,
  vocab: Vocab,
  frameToTime: FrameToTime,
  blank: number
): Word[] {
  const { tokens, wordOfToken, words } = tokenize(text, vocab)
  if (tokens.length === 0) return []

  const spans = forcedAlign(emission, tokens, blank)

  // 단어별로 토큰 구간을 모은다
  const acc = words.map(() => ({
    startFrame: Number.POSITIVE_INFINITY,
    endFrame: 0,
    scoreSum: 0,
    count: 0
  }))

  for (const span of spans) {
    const wordIndex = wordOfToken[span.tokenIndex]
    if (wordIndex < 0) continue // 단어 구분자
    const a = acc[wordIndex]
    a.startFrame = Math.min(a.startFrame, span.startFrame)
    a.endFrame = Math.max(a.endFrame, span.endFrame)
    a.scoreSum += span.score
    a.count += 1
  }

  const result: Word[] = []
  words.forEach((word, i) => {
    const a = acc[i]
    if (a.count === 0) return // 정렬되지 않은 단어는 생략
    result.push({
      text: word,
      start: frameToTime(a.startFrame),
      end: frameToTime(a.endFrame),
      score: a.scoreSum / a.count
    })
  })
  return result
}
