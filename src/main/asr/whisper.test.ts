import { describe, expect, it, vi } from 'vitest'
import {
  buildHotwordPrompt,
  buildWhisperOptions,
  makeProgressForwarder,
  parseTranscription,
  transcribe
} from './whisper'

let mockTranscribeCallCount = 0
let mockTranscribeActiveCount = 0
let maxMockTranscribeConcurrentCount = 0

vi.mock('@kutalia/whisper-node-addon', () => {
  const mockFn = vi.fn(async () => {
    mockTranscribeCallCount++
    mockTranscribeActiveCount++
    maxMockTranscribeConcurrentCount = Math.max(
      maxMockTranscribeConcurrentCount,
      mockTranscribeActiveCount
    )
    // Simulate inference latency
    await new Promise((resolve) => setTimeout(resolve, 50))
    mockTranscribeActiveCount--
    return {
      transcription: [['00:00:00.000', '00:00:01.000', 'mock text']],
      language: 'ko'
    }
  })
  return {
    transcribe: mockFn,
    default: {
      transcribe: mockFn
    }
  }
})

vi.mock('../models/manager', () => {
  return {
    ensureWhisperModel: vi.fn(async () => 'fake-whisper-model-path.bin'),
    ensureVadModel: vi.fn(async () => 'fake-vad-model-path.bin')
  }
})

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

describe('transcribe Mutex concurrency test', () => {
  it('동시 전사 시 락을 통해 순차적으로 실행되는지 검증한다', async () => {
    mockTranscribeCallCount = 0
    mockTranscribeActiveCount = 0
    maxMockTranscribeConcurrentCount = 0

    // 동시에 3개의 transcribe 실행 요청
    const p1 = transcribe(new Float32Array(), { model: 'base', gpu: false, vad: false })
    const p2 = transcribe(new Float32Array(), { model: 'base', gpu: false, vad: false })
    const p3 = transcribe(new Float32Array(), { model: 'base', gpu: false, vad: false })

    const [r1, r2, r3] = await Promise.all([p1, p2, p3])

    // 3개 모두 전사가 정상 완료되었는지 확인
    expect(r1.segments[0].text).toBe('mock text')
    expect(r2.segments[0].text).toBe('mock text')
    expect(r3.segments[0].text).toBe('mock text')

    // 전사 총 호출 횟수
    expect(mockTranscribeCallCount).toBe(3)

    // 동시에 들어간 횟수는 최대 1이어야 함 (순차 실행 검증)
    expect(maxMockTranscribeConcurrentCount).toBe(1)
  })
})
