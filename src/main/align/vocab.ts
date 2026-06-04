// wav2vec2 정렬 모델의 vocab 로딩.
// 모델 소스마다 vocab 표현이 다르다.
//  - vocab.json(평면): { "<pad>": 0, "|": 4, "a": 7, ... }            (Xenova/onnx-community/jonatasgrosman)
//  - tokenizer.json    : { "model": { "vocab": { "[PAD]": 1204, ... } } } (FinDIT-Studio 변환본)
// 두 형식을 모두 받아 동일한 Vocab과 CTC blank id로 정규화한다.

import type { Vocab } from './tokenizer'

/** CTC blank(pad) 후보 토큰 키 (모델마다 표기가 다름). */
const PAD_KEYS = ['<pad>', '[PAD]', '<PAD>', '[pad]'] as const

/**
 * 임의의 JSON에서 토큰→id 매핑을 꺼낸다.
 * tokenizer.json이면 model.vocab을, vocab.json이면 객체 자체를 사용한다.
 */
export function extractVocab(json: unknown): Vocab {
  if (!json || typeof json !== 'object') {
    throw new Error('정렬 vocab 파싱 실패: 객체가 아님')
  }
  const model = (json as { model?: { vocab?: unknown } }).model
  if (model && typeof model.vocab === 'object' && model.vocab !== null) {
    return model.vocab as Vocab
  }
  return json as Vocab
}

/** vocab에서 CTC blank id를 찾는다. pad 토큰이 없으면 0으로 가정한다. */
export function blankOf(vocab: Vocab): number {
  for (const key of PAD_KEYS) {
    if (key in vocab) return vocab[key]
  }
  return 0
}

/** vocab.json 또는 tokenizer.json 원문을 받아 Vocab과 blank id를 만든다. */
export function parseVocab(raw: string): { vocab: Vocab; blank: number } {
  const vocab = extractVocab(JSON.parse(raw) as unknown)
  return { vocab, blank: blankOf(vocab) }
}
