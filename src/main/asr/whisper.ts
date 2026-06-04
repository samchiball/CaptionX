import type { WhisperOptions } from '@kutalia/whisper-node-addon'
import whisper from '@kutalia/whisper-node-addon'
import type { Segment, TranscriptResult } from '@shared/types'
import { throwIfCanceled } from '../cancellation'
import { parseTimecode } from '../export/timecode'
import { type DownloadProgress, ensureVadModel, ensureWhisperModel } from '../models/manager'

class Mutex {
  private queue: Promise<void> = Promise.resolve()

  async acquire(): Promise<() => void> {
    let release: () => void = () => {}
    const nextQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    const currentQueue = this.queue
    this.queue = nextQueue
    await currentQueue
    return release
  }
}

const whisperMutex = new Mutex()

export interface WhisperParams {
  model: string
  language?: string
  gpu: boolean
  vad: boolean
  /** 핫워드 단어장에서 만든 initial_prompt 문자열(인식 정확도 보정) */
  prompt?: string
  /**
   * whisper.cpp 추론 스레드 수(n_threads). 단일 전사 한 건이 쓰는 CPU 스레드 수이며,
   * 파일 동시성(concurrency)과는 별개다. 0/미지정이면 whisper.cpp 기본값을 쓴다.
   */
  threads?: number
  onModelProgress?: (p: DownloadProgress) => void
  /**
   * whisper.cpp 네이티브 전사 진행률 콜백(0..100). 장시간 파일에서 전사 단계가
   * 한 번의 블로킹 호출로 끝나 진행 표시가 멈추는 것을 막기 위해 사용한다.
   */
  onTranscribeProgress?: (pct: number) => void
}

/**
 * whisper.cpp 애드온의 공개 타입에는 빠져 있지만 네이티브가 받는 initial_prompt 키.
 * 핫워드 단어장을 prompt로 주입해 고유명사·전문용어 인식을 보정한다.
 */
type WhisperBaseOptions = Omit<WhisperOptions, 'model'> & { model: string; prompt?: string }

/**
 * 핫워드 단어장을 Whisper initial_prompt 문자열로 변환한다(순수 함수).
 * 트림·빈 값 제거·중복 제거 후 쉼표로 잇는다. 유효 단어가 없으면 undefined.
 */
export function buildHotwordPrompt(hotwords?: string[]): string | undefined {
  if (!hotwords) return undefined
  const seen = new Set<string>()
  const terms: string[] = []
  for (const raw of hotwords) {
    const term = raw.trim()
    if (!term || seen.has(term)) continue
    seen.add(term)
    terms.push(term)
  }
  return terms.length > 0 ? terms.join(', ') : undefined
}

/**
 * whisper.cpp 애드온의 실제 반환 형식. 공개 타입에는 빠져 있지만 네이티브 코드는
 * language='auto'일 때 감지된 언어 코드를 result.language로 함께 반환한다(addon.cpp).
 */
interface WhisperResult {
  transcription: unknown
  language?: string
}

/** whisper.cpp 애드온 출력 한 줄: [시작 타임코드, 끝 타임코드, 텍스트] */
type RawRow = [string, string, string]

function isRawRow(row: unknown): row is RawRow {
  return Array.isArray(row) && row.length >= 3 && typeof row[0] === 'string'
}

/**
 * whisper.cpp(@kutalia/whisper-node-addon) 출력의 [from,to,text] 튜플 배열을
 * Segment[]로 변환한다. 빈 텍스트 행은 제외한다.
 */
export function parseTranscription(transcription: unknown): Segment[] {
  if (!Array.isArray(transcription)) return []
  const segments: Segment[] = []
  for (const row of transcription) {
    if (!isRawRow(row)) continue
    const text = row[2].trim()
    if (!text) continue
    segments.push({
      start: parseTimecode(row[0]),
      end: parseTimecode(row[1]),
      text,
      words: []
    })
  }
  return segments
}

/**
 * 네이티브 progress_callback(0..100, 실수/정수 혼재 가능)을 정수로 정규화하고
 * 값이 바뀔 때만 상위로 전달한다. 콜백에서 던진 예외는 전사를 끊지 않도록 삼킨다.
 */
export function makeProgressForwarder(
  onTranscribeProgress: (pct: number) => void
): (progress: unknown) => void {
  let last = -1
  return (progress: unknown) => {
    const raw = typeof progress === 'number' ? progress : Number(progress)
    if (!Number.isFinite(raw)) return
    const pct = Math.max(0, Math.min(100, Math.round(raw)))
    if (pct === last) return
    last = pct
    try {
      onTranscribeProgress(pct)
    } catch {
      // 진행률 표시 실패는 전사 결과에 영향을 주지 않으므로 무시한다.
    }
  }
}

export function buildWhisperOptions(
  pcm: Float32Array,
  modelPath: string,
  params: WhisperParams,
  extra: Partial<WhisperBaseOptions> = {},
  vadModelPath?: string
): WhisperOptions & { prompt?: string } {
  return {
    pcmf32: pcm,
    model: modelPath,
    language: params.language ?? 'auto',
    use_gpu: params.gpu,
    // vad_model이 있어야 whisper.cpp가 VAD를 초기화한다. 경로 없이 vad:true만
    // 주면 전사 결과가 비므로, 모델이 확보됐을 때만 vad를 켠다.
    vad: params.vad && Boolean(vadModelPath),
    ...(vadModelPath ? { vad_model: vadModelPath } : {}),
    // 핫워드 단어장이 있으면 initial_prompt로 주입한다.
    ...(params.prompt ? { prompt: params.prompt } : {}),
    // 추론 스레드 수. 0/미지정이면 키를 넣지 않아 whisper.cpp 기본값을 따른다.
    ...(params.threads && params.threads > 0 ? { n_threads: params.threads } : {}),
    // 네이티브 전사 진행률(0..100)을 그대로 흘려보낸다. 콜백 예외가 전사를
    // 중단시키지 않도록 방어적으로 감싼다.
    ...(params.onTranscribeProgress
      ? { progress_callback: makeProgressForwarder(params.onTranscribeProgress) }
      : {}),
    translate: false,
    no_prints: true,
    comma_in_time: false,
    ...extra
  }
}

/**
 * 16kHz mono PCM(Float32)을 받아 Whisper 세그먼트 전사 결과를 만든다.
 * 단어 레벨 타임스탬프는 이후 wav2vec2 강제정렬 단계에서 채운다.
 */
export async function transcribe(
  pcm: Float32Array,
  params: WhisperParams,
  signal?: AbortSignal
): Promise<TranscriptResult> {
  const modelPath = await ensureWhisperModel(params.model, params.onModelProgress)
  const vadModelPath = params.vad ? await ensureVadModel() : undefined

  throwIfCanceled(signal)

  const release = await whisperMutex.acquire()
  try {
    throwIfCanceled(signal)
    const result = (await whisper.transcribe(
      buildWhisperOptions(pcm, modelPath, params, {}, vadModelPath)
    )) as WhisperResult
    return {
      // language='auto'면 네이티브가 감지한 언어 코드를 돌려준다. 지정 언어가 있으면 그대로 유지.
      language: normalizeLanguage(params.language) ?? result.language ?? 'auto',
      segments: parseTranscription(result.transcription)
    }
  } finally {
    release()
  }
}

/** 'auto'/빈 값은 감지 결과를 쓰도록 undefined로 정규화한다. */
function normalizeLanguage(language?: string): string | undefined {
  const lang = (language ?? '').trim().toLowerCase()
  return lang === '' || lang === 'auto' ? undefined : language
}
