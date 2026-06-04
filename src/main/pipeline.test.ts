import type { TranscribeOptions, TranscriptResult } from '@shared/types'
import { describe, expect, it, vi } from 'vitest'
import {
  CancellationError,
  isCancellation,
  type ProgressFn,
  resolveAlignment,
  resolveAlignmentConcurrency,
  synthesizeSegmentWords
} from './pipeline'

vi.mock('electron', () => ({ app: { getPath: () => 'test-user-data' } }))

const baseOptions: TranscribeOptions = {
  filePath: 'a.mp4',
  model: 'base',
  align: true,
  alignMode: 'wav2vec2',
  gpu: false,
  vad: false,
  denoise: false
}

function makeResult(language: string, text = 'hello'): TranscriptResult {
  return { language, segments: [{ start: 0, end: 1, text, words: [] }] }
}

describe('resolveAlignment', () => {
  it('사용자가 mms 모드를 선택하면 mms 모드를 반환한다', () => {
    const out = resolveAlignment(
      { ...baseOptions, alignMode: 'mms', language: 'ko' },
      makeResult('ko')
    )
    expect(out).toEqual({ alignMode: 'mms', alignLanguage: 'ko' })
  })

  it('자동 언어면 Whisper 감지 언어로 wav2vec2 모델을 고른다', () => {
    const out = resolveAlignment({ ...baseOptions, language: undefined }, makeResult('ko'))
    expect(out).toEqual({ alignMode: 'wav2vec2', alignLanguage: 'ko' })
  })

  it('사용자가 지정한 언어를 우선한다', () => {
    const out = resolveAlignment({ ...baseOptions, language: 'ja' }, makeResult('ko'))
    expect(out.alignLanguage).toBe('ja')
    expect(out.alignMode).toBe('wav2vec2')
  })

  it('감지 언어가 비면 전사 스크립트로 보조 추정한다', () => {
    const out = resolveAlignment(
      { ...baseOptions, language: undefined },
      makeResult('auto', '안녕하세요')
    )
    expect(out).toEqual({ alignMode: 'wav2vec2', alignLanguage: 'ko' })
  })

  it('지원 모델이 없는 언어는 근사 단어 합성으로 폴백한다', () => {
    const out = resolveAlignment({ ...baseOptions, language: undefined }, makeResult('he', 'abc'))
    expect(out.alignMode).toBe('synthesize')
    expect(out.alignLanguage).toBe('he')
  })
})

describe('resolveAlignmentConcurrency', () => {
  it('세그먼트가 없으면 병렬 worker를 만들지 않는다', () => {
    expect(resolveAlignmentConcurrency(false, 0)).toBe(0)
    expect(resolveAlignmentConcurrency(true, 0)).toBe(0)
  })

  it('CPU 정렬은 ONNX thread 중첩을 피하려고 단일 세그먼트씩 처리한다', () => {
    expect(resolveAlignmentConcurrency(false, 1)).toBe(1)
    expect(resolveAlignmentConcurrency(false, 8)).toBe(1)
  })

  it('GPU 정렬은 세그먼트 수를 넘지 않는 최대 4개 worker를 쓴다', () => {
    expect(resolveAlignmentConcurrency(true, 1)).toBe(1)
    expect(resolveAlignmentConcurrency(true, 3)).toBe(3)
    expect(resolveAlignmentConcurrency(true, 8)).toBe(4)
  })
})

describe('isCancellation', () => {
  it('CancellationError 인스턴스를 취소로 인식한다', () => {
    expect(isCancellation(new CancellationError())).toBe(true)
  })

  it('이름이 CancellationError 인 일반 Error 도 인식한다', () => {
    const err = new Error('무언가')
    err.name = 'CancellationError'
    expect(isCancellation(err)).toBe(true)
  })

  it('취소 메시지를 담은 Error 는 프로세스 경계 이후에도 인식한다', () => {
    expect(isCancellation(new Error('작업이 취소되었습니다.'))).toBe(true)
  })

  it('일반 오류는 취소로 보지 않는다', () => {
    expect(isCancellation(new Error('디코드 실패'))).toBe(false)
    expect(isCancellation(undefined)).toBe(false)
    expect(isCancellation('취소')).toBe(false)
  })
})

describe('synthesizeSegmentWords', () => {
  const noop: ProgressFn = () => undefined

  it('세그먼트 텍스트를 공백 토큰으로 나눠 구간에 균등 분배한다', () => {
    const result: TranscriptResult = {
      language: 'en',
      segments: [{ start: 0, end: 2, text: 'hello world', words: [] }]
    }

    synthesizeSegmentWords(result, noop)

    const words = result.segments[0].words
    expect(words.map((w) => w.text)).toEqual(['hello', 'world'])
    expect(words[0].start).toBe(0)
    expect(words[0].end).toBe(1)
    expect(words[1].start).toBe(1)
    expect(words[1].end).toBe(2)
    // 합성 단어임을 score 0으로 표시
    expect(words.every((w) => w.score === 0)).toBe(true)
  })

  it('단어 경계가 세그먼트 시작·끝과 정확히 맞물린다', () => {
    const result: TranscriptResult = {
      language: 'ko',
      segments: [{ start: 5.32, end: 8.64, text: '약간 이런 것들은 뭐 하면은', words: [] }]
    }

    synthesizeSegmentWords(result, noop)

    const words = result.segments[0].words
    expect(words.map((w) => w.text)).toEqual(['약간', '이런', '것들은', '뭐', '하면은'])
    expect(words[0].start).toBe(5.32)
    expect(words.at(-1)?.end).toBe(8.64)
  })

  it('빈 텍스트 세그먼트는 빈 단어 배열로 둔다', () => {
    const result: TranscriptResult = {
      language: 'en',
      segments: [{ start: 0, end: 1, text: '   ', words: [] }]
    }

    synthesizeSegmentWords(result, noop)

    expect(result.segments[0].words).toEqual([])
  })
})
