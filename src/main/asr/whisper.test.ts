import { describe, expect, it } from 'vitest'
import {
  buildHotwordPrompt,
  buildWhisperOptions,
  makeProgressForwarder,
  parseTranscription
} from './whisper'

describe('buildHotwordPrompt', () => {
  it('단어들을 쉼표로 이어 프롬프트를 만든다', () => {
    expect(buildHotwordPrompt(['CaptionX', 'wav2vec2', 'Whisper'])).toBe(
      'CaptionX, wav2vec2, Whisper'
    )
  })

  it('공백 단어와 중복을 제거하고 트림한다', () => {
    expect(buildHotwordPrompt([' CaptionX ', '', '   ', 'CaptionX', 'ONNX'])).toBe('CaptionX, ONNX')
  })

  it('비었거나 의미 없는 입력이면 undefined', () => {
    expect(buildHotwordPrompt(undefined)).toBeUndefined()
    expect(buildHotwordPrompt([])).toBeUndefined()
    expect(buildHotwordPrompt(['', '   '])).toBeUndefined()
  })
})

describe('parseTranscription', () => {
  it('[from,to,text] 튜플을 Segment로 변환한다', () => {
    const raw = [
      ['00:00:00.000', '00:00:00.320', ''],
      ['00:00:00.320', '00:00:00.940', ' And so'],
      ['00:00:00.940', '00:00:03.290', ' my fellow Americans']
    ]
    const segments = parseTranscription(raw)
    expect(segments).toHaveLength(2) // 빈 텍스트 행 제외
    expect(segments[0]).toMatchObject({ start: 0.32, end: 0.94, text: 'And so', words: [] })
    expect(segments[1].text).toBe('my fellow Americans')
    expect(segments[1].end).toBeCloseTo(3.29, 5)
  })

  it('배열이 아니면 빈 결과', () => {
    expect(parseTranscription(undefined)).toEqual([])
    expect(parseTranscription('nope')).toEqual([])
  })

  it('형식이 어긋난 행은 건너뛴다', () => {
    const raw = [['only-one'], ['00:00:00.000', '00:00:01.000', 'ok']]
    const segments = parseTranscription(raw)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('ok')
  })
})

describe('makeProgressForwarder', () => {
  it('진행률을 정수로 정규화하고 값이 바뀔 때만 전달한다', () => {
    const seen: number[] = []
    const forward = makeProgressForwarder((pct) => seen.push(pct))

    forward(0)
    forward(0.4) // 0으로 반올림 → 중복, 무시
    forward(12.6) // 13
    forward(13.1) // 13 → 중복, 무시
    forward(100)

    expect(seen).toEqual([0, 13, 100])
  })

  it('범위를 0..100으로 클램프한다', () => {
    const seen: number[] = []
    const forward = makeProgressForwarder((pct) => seen.push(pct))

    forward(-5)
    forward(150)

    expect(seen).toEqual([0, 100])
  })

  it('숫자가 아니거나 NaN이면 무시한다', () => {
    const seen: number[] = []
    const forward = makeProgressForwarder((pct) => seen.push(pct))

    forward(undefined)
    forward('nope')
    forward(NaN)

    expect(seen).toEqual([])
  })

  it('콜백 예외를 삼켜 전사를 끊지 않는다', () => {
    const forward = makeProgressForwarder(() => {
      throw new Error('렌더러 전송 실패')
    })

    expect(() => forward(50)).not.toThrow()
  })
})

describe('buildWhisperOptions', () => {
  it('onTranscribeProgress가 있으면 progress_callback을 전달한다', () => {
    const options = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: false,
      onTranscribeProgress: () => {}
    })

    expect(typeof options.progress_callback).toBe('function')
  })

  it('onTranscribeProgress가 없으면 progress_callback 키를 넣지 않는다', () => {
    const options = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: false
    })

    expect(options).not.toHaveProperty('progress_callback')
  })

  it('VAD 모델 경로가 있으면 vad와 vad_model을 함께 전달한다', () => {
    const pcm = new Float32Array([0, 0.25, -0.25])

    const options = buildWhisperOptions(
      pcm,
      'models/ggml-base.bin',
      {
        model: 'base',
        language: 'ko',
        gpu: true,
        vad: true
      },
      {},
      'models/ggml-silero.bin'
    )

    expect(options).toMatchObject({
      pcmf32: pcm,
      model: 'models/ggml-base.bin',
      language: 'ko',
      use_gpu: true,
      vad: true,
      vad_model: 'models/ggml-silero.bin',
      translate: false,
      no_prints: true,
      comma_in_time: false
    })
  })

  it('VAD 모델 경로가 없으면 vad:true라도 비활성화한다', () => {
    const options = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: true
    })

    expect(options.vad).toBe(false)
    expect(options).not.toHaveProperty('vad_model')
  })

  it('prompt가 있으면 whisper 옵션에 그대로 전달한다', () => {
    const options = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: false,
      prompt: 'CaptionX, wav2vec2'
    })

    expect(options).toHaveProperty('prompt', 'CaptionX, wav2vec2')
  })

  it('prompt가 없으면 prompt 키를 넣지 않는다', () => {
    const options = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: false
    })

    expect(options).not.toHaveProperty('prompt')
  })

  it('threads가 양수면 n_threads로 전달한다', () => {
    const options = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: false,
      threads: 8
    })

    expect(options).toHaveProperty('n_threads', 8)
  })

  it('threads가 0이거나 없으면 n_threads 키를 넣지 않는다(기본값 사용)', () => {
    const zero = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: false,
      threads: 0
    })
    const none = buildWhisperOptions(new Float32Array(), 'models/ggml-base.bin', {
      model: 'base',
      gpu: false,
      vad: false
    })

    expect(zero).not.toHaveProperty('n_threads')
    expect(none).not.toHaveProperty('n_threads')
  })

  it('네이티브 단어 타임스탬프용 추가 옵션과 VAD를 함께 유지한다', () => {
    const options = buildWhisperOptions(
      new Float32Array(),
      'models/ggml-small.bin',
      {
        model: 'small',
        gpu: false,
        vad: false
      },
      { max_len: 1 }
    )

    expect(options).toMatchObject({
      language: 'auto',
      use_gpu: false,
      vad: false,
      max_len: 1
    })
  })
})
