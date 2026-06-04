import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { app } from 'electron'
import { resolveBundledResource } from '../resources'

const HF = 'https://huggingface.co'

/** 모델 캐시 루트 (userData/models) */
export function modelsDir(): string {
  return join(app.getPath('userData'), 'models')
}

/** Whisper ggml 모델 다운로드 URL (Hugging Face) */
const WHISPER_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

export function whisperModelFile(model: string): string {
  return join(modelsDir(), `ggml-${model}.bin`)
}

/**
 * whisper.cpp VAD(Silero) GGML 모델. vad:true로 전사할 때 반드시 필요하며,
 * 경로가 없으면 네이티브 측이 VAD 초기화에 실패해 전사 결과가 비어버린다.
 */
const VAD_MODEL_FILE = 'ggml-silero-v5.1.2.bin'
const VAD_MODEL_URL = `${HF}/ggml-org/whisper-vad/resolve/main/${VAD_MODEL_FILE}`

export function vadModelFile(): string {
  return join(modelsDir(), VAD_MODEL_FILE)
}

/**
 * Silero VAD 모델을 확보한다. 없으면 다운로드, 있으면 캐시 경로 반환.
 */
export async function ensureVadModel(onProgress?: (p: DownloadProgress) => void): Promise<string> {
  const dest = vadModelFile()
  if (await existsCached(dest)) return dest
  await download(VAD_MODEL_URL, dest, onProgress)
  return dest
}

// ── GTCRN 음성 향상 모델 ───────────────────────────────────────────────

// 오프라인(non-streaming) GTCRN. 전체 스펙트로그램 [1,257,T,2] 를 한 번에 추론한다.
// 과거 sherpa 의 스트리밍 모델(gtcrn_simple.onnx)은 프레임당 session.run() 을 해야 해서
// 호출 오버헤드가 지배적이라 매우 느렸다(10분 오디오 ≈ 49초). 오프라인 모델은 청크 단위
// 단일 추론으로 약 8배 빠르다. 작은 파일(≈415KB)이라 다운로드 대신 앱에 번들한다.
const GTCRN_MODEL_FILE = 'gtcrn_offline.onnx'

export function gtcrnModelFile(): string {
  return join(modelsDir(), GTCRN_MODEL_FILE)
}

/**
 * GTCRN 음성 향상 모델을 확보한다. 번들된 리소스를 캐시 디렉터리로 한 번 복사하고
 * 실제 파일 경로를 돌려준다(onnxruntime 은 asar 경로 리다이렉션을 못 타므로 실제 경로가 필요).
 */
export async function ensureGtcrnModel(
  _onProgress?: (p: DownloadProgress) => void
): Promise<string> {
  const dest = gtcrnModelFile()
  if (await existsCached(dest)) return dest
  const bundled = resolveBundledResource(GTCRN_MODEL_FILE)
  await mkdir(dirname(dest), { recursive: true })
  await copyFile(bundled, dest)
  return dest
}

export interface DownloadProgress {
  received: number
  total: number
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const validatedFiles = new Set<string>()

export async function existsCached(path: string): Promise<boolean> {
  if (validatedFiles.has(path)) return true
  const res = await exists(path)
  if (res) {
    validatedFiles.add(path)
  }
  return res
}

async function download(
  url: string,
  dest: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  const res = await fetch(url)
  if (!res.ok || !res.body) {
    throw new Error(`다운로드 실패 ${res.status}: ${url}`)
  }
  const total = Number(res.headers.get('content-length') ?? 0)
  let received = 0
  const reader = res.body
  const out = createWriteStream(dest)
  const nodeStream = Readable.fromWeb(reader as unknown as Parameters<typeof Readable.fromWeb>[0])
  nodeStream.on('data', (chunk: Buffer) => {
    received += chunk.length
    onProgress?.({ received, total })
  })
  await finished(nodeStream.pipe(out))
}

/**
 * Whisper 모델을 확보한다. 없으면 다운로드, 있으면 캐시 경로 반환.
 */
export async function ensureWhisperModel(
  model: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<string> {
  const dest = whisperModelFile(model)
  if (await existsCached(dest)) return dest
  await download(`${WHISPER_BASE_URL}/ggml-${model}.bin`, dest, onProgress)
  return dest
}

// ── wav2vec2 강제정렬 모델 ──────────────────────────────────────────────

const MMS_ALIGN_MODEL: AlignModelSource = {
  key: 'mms-300m-1130-forced-aligner',
  onnxUrl: `${HF}/onnx-community/mms-300m-1130-forced-aligner-ONNX/resolve/main/onnx/model_quantized.onnx`,
  vocabUrl: `${HF}/onnx-community/mms-300m-1130-forced-aligner-ONNX/resolve/main/vocab.json`
}

/** 언어별 wav2vec2 CTC 정렬 모델 레지스트리 (ONNX) */
interface AlignModelSource {
  /** 캐시 식별자(파일명 접두) */
  key: string
  /** ONNX 모델 다운로드 URL */
  onnxUrl: string
  /**
   * vocab 다운로드 URL. 평면 vocab.json 또는 tokenizer.json 어느 쪽이든 가능하며
   * model-loader가 형식을 자동 감지한다(parseVocab).
   */
  vocabUrl: string
}

/**
 * WhisperX의 언어별 정렬 모델(jonatasgrosman/kresnik wav2vec2-xlsr 등)을
 * onnxruntime-node로 돌릴 수 있는 ONNX 변환본에 매핑한다.
 *  - onnx-community/*  : onnx/model_quantized.onnx + 루트 vocab.json (양자화, 가벼움)
 *  - FinDIT-Studio/*   : 루트 model.onnx + tokenizer.json (full precision, ~1.2GB)
 * 각 모델의 vocab은 같은 리포에서 받아 출력층 인덱스 불일치를 방지한다.
 */
const ALIGN_MODELS: Record<string, AlignModelSource> = {
  en: {
    key: 'wav2vec2-base-960h',
    onnxUrl: `${HF}/Xenova/wav2vec2-base-960h/resolve/main/onnx/model_quantized.onnx`,
    vocabUrl: `${HF}/Xenova/wav2vec2-base-960h/resolve/main/vocab.json`
  },
  ja: {
    key: 'wav2vec2-xlsr-53-japanese',
    onnxUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-japanese-onnx/resolve/main/model.onnx`,
    vocabUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-japanese-onnx/resolve/main/tokenizer.json`
  },
  ko: {
    key: 'wav2vec2-xlsr-53-korean',
    onnxUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx/resolve/main/model.onnx`,
    vocabUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-korean-onnx/resolve/main/tokenizer.json`
  },
  zh: {
    key: 'wav2vec2-xlsr-53-chinese',
    onnxUrl: `${HF}/onnx-community/wav2vec2-large-xlsr-53-chinese-zh-cn-ONNX/resolve/main/onnx/model_quantized.onnx`,
    vocabUrl: `${HF}/onnx-community/wav2vec2-large-xlsr-53-chinese-zh-cn-ONNX/resolve/main/vocab.json`
  },
  es: {
    key: 'wav2vec2-xlsr-53-spanish',
    onnxUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-spanish-onnx/resolve/main/model.onnx`,
    vocabUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-spanish-onnx/resolve/main/tokenizer.json`
  },
  fr: {
    key: 'wav2vec2-xlsr-53-french',
    onnxUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-french-onnx/resolve/main/model.onnx`,
    vocabUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-french-onnx/resolve/main/tokenizer.json`
  },
  de: {
    key: 'wav2vec2-xlsr-53-german',
    onnxUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-german-onnx/resolve/main/model.onnx`,
    vocabUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-german-onnx/resolve/main/tokenizer.json`
  },
  it: {
    key: 'wav2vec2-xlsr-53-italian',
    onnxUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-italian-onnx/resolve/main/model.onnx`,
    vocabUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-italian-onnx/resolve/main/tokenizer.json`
  },
  pt: {
    key: 'wav2vec2-xlsr-53-portuguese',
    onnxUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-portuguese-onnx/resolve/main/model.onnx`,
    vocabUrl: `${HF}/FinDIT-Studio/wav2vec2-large-xlsr-53-portuguese-onnx/resolve/main/tokenizer.json`
  },
  ru: {
    key: 'wav2vec2-xlsr-53-russian',
    onnxUrl: `${HF}/onnx-community/wav2vec2-large-xlsr-53-russian-ONNX/resolve/main/onnx/model_quantized.onnx`,
    vocabUrl: `${HF}/onnx-community/wav2vec2-large-xlsr-53-russian-ONNX/resolve/main/vocab.json`
  },
  tr: {
    key: 'wav2vec2-xlsr-turkish',
    onnxUrl: `${HF}/onnx-community/wav2vec2-large-xlsr-turkish-ONNX/resolve/main/onnx/model_quantized.onnx`,
    vocabUrl: `${HF}/onnx-community/wav2vec2-large-xlsr-turkish-ONNX/resolve/main/vocab.json`
  },
  pl: {
    key: 'wav2vec2-voxpopuli-polish',
    onnxUrl: `${HF}/onnx-community/wav2vec2-base-10k-voxpopuli-ft-pl-ONNX/resolve/main/onnx/model_quantized.onnx`,
    vocabUrl: `${HF}/onnx-community/wav2vec2-base-10k-voxpopuli-ft-pl-ONNX/resolve/main/vocab.json`
  }
}

/**
 * voidful/wav2vec2-xlsr-multilingual-56의 ONNX 변환본. Common Voice 56개 언어로
 * 미세조정된 단일 XLSR-large CTC 모델로, 라틴/키릴/아랍/데바나가리/태국/그리스 등
 * 다양한 스크립트를 한 vocab(9913토큰, '|' 단어구분 9908, '[PAD]' blank 9910)에 담는다.
 * 전용 모델이 없는 언어들이 이 한 모델을 공유한다(같은 key → 1회만 다운로드).
 */
const MULTILINGUAL_56: AlignModelSource = {
  key: 'wav2vec2-xlsr-multilingual-56',
  onnxUrl: `${HF}/NewComer00/wav2vec2-xlsr-multilingual-56-ONNX/resolve/main/onnx/model.onnx`,
  vocabUrl: `${HF}/NewComer00/wav2vec2-xlsr-multilingual-56-ONNX/resolve/main/vocab.json`
}

/**
 * 전용 정렬 모델이 없지만 다국어-56 모델이 학습·지원하는 언어들.
 * 이들의 스크립트 문자는 모두 다국어-56 vocab에 존재함을 확인했다.
 */
const MULTILINGUAL_56_LANGS = [
  'nl', // 네덜란드어
  'uk', // 우크라이나어
  'cs', // 체코어
  'el', // 그리스어
  'hu', // 헝가리어
  'fi', // 핀란드어
  'ro', // 루마니아어
  'ar', // 아랍어
  'hi', // 힌디어
  'id', // 인도네시아어
  'th', // 태국어
  'vi' // 베트남어
] as const

for (const lang of MULTILINGUAL_56_LANGS) {
  ALIGN_MODELS[lang] = MULTILINGUAL_56
}

const DEFAULT_ALIGN_LANG = 'en'

export interface AlignModelFiles {
  onnxPath: string
  vocabPath: string
  /** preprocessor_config.json 경로 (다운로드 실패 시 undefined) */
  featurePath?: string
}

/** 언어에 대응하는 정렬 모델 소스를 고른다 (없으면 영어 기본). */
function alignSourceFor(language?: string): AlignModelSource {
  const lang = (language ?? '').toLowerCase().split(/[-_]/)[0]
  return ALIGN_MODELS[lang] ?? ALIGN_MODELS[DEFAULT_ALIGN_LANG]
}

/** onnx URL의 리포 루트(.../resolve/main/)에서 preprocessor_config.json URL을 만든다. */
function featureUrlOf(onnxUrl: string): string {
  const marker = '/resolve/main/'
  const idx = onnxUrl.indexOf(marker)
  if (idx < 0) return ''
  return `${onnxUrl.slice(0, idx + marker.length)}preprocessor_config.json`
}

/** 해당 언어의 정렬 모델을 지원하는지 여부. */
export function hasAlignModel(language?: string): boolean {
  const lang = (language ?? '').toLowerCase().split(/[-_]/)[0]
  return lang in ALIGN_MODELS
}

/** 언어 지정이 비어 있거나 'auto'면 자동 감지로 간주한다. */
export function isAutoLanguage(language?: string): boolean {
  const lang = (language ?? '').toLowerCase().split(/[-_]/)[0]
  return lang === '' || lang === 'auto'
}

/**
 * 전사된 텍스트의 문자(스크립트)로 정렬 모델 언어를 추정한다.
 * Whisper 애드온이 감지 언어를 노출하지 않으므로, 언어가 '자동'일 때
 * 한글/가나/키릴/한자 등 식별 가능한 스크립트로 wav2vec2 모델 언어를 고른다.
 * 라틴 문자처럼 단일 언어로 특정하기 어려운 경우 undefined를 반환한다.
 */
export function detectAlignLanguage(text: string): string | undefined {
  let hangul = 0
  let kana = 0
  let han = 0
  let cyrillic = 0
  let devanagari = 0
  let arabic = 0
  let thai = 0
  let greek = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code >= 0xac00 && code <= 0xd7a3) hangul++
    else if ((code >= 0x3040 && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff)) kana++
    else if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf)) han++
    else if (code >= 0x0400 && code <= 0x04ff) cyrillic++
    else if (code >= 0x0900 && code <= 0x097f) devanagari++
    else if (code >= 0x0600 && code <= 0x06ff) arabic++
    else if (code >= 0x0e00 && code <= 0x0e7f) thai++
    else if (code >= 0x0370 && code <= 0x03ff) greek++
  }
  if (hangul > 0) return 'ko'
  if (kana > 0) return 'ja' // 가나가 있으면 한자가 섞여도 일본어
  if (han > 0) return 'zh'
  if (devanagari > 0) return 'hi'
  if (thai > 0) return 'th'
  if (greek > 0) return 'el'
  if (arabic > 0) return 'ar'
  if (cyrillic > 0) return 'ru' // 키릴은 ru/uk 공용 — 전용 ru 모델로 정렬
  return undefined
}

/**
 * wav2vec2 정렬 모델(ONNX + vocab)을 확보한다. 없으면 다운로드 후 캐시 경로 반환.
 */
export async function ensureAlignModel(
  alignMode: 'wav2vec2' | 'mms',
  language?: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<AlignModelFiles> {
  const src = alignMode === 'mms' ? MMS_ALIGN_MODEL : alignSourceFor(language)
  const onnxPath = join(modelsDir(), `${src.key}.onnx`)
  const vocabPath = join(modelsDir(), `${src.key}.vocab.json`)
  const featurePath = join(modelsDir(), `${src.key}.preprocessor.json`)

  if (!(await existsCached(vocabPath))) {
    await download(src.vocabUrl, vocabPath)
  }
  if (!(await existsCached(featurePath))) {
    // do_normalize 추출용. 없거나 실패해도 정렬은 진행한다(기본값 사용).
    const featureUrl = featureUrlOf(src.onnxUrl)
    if (featureUrl) {
      try {
        await download(featureUrl, featurePath)
      } catch {
        // 무시 - model-loader가 기본값으로 폴백
      }
    }
  }
  if (!(await existsCached(onnxPath))) {
    await download(src.onnxUrl, onnxPath, onProgress)
  }
  return { onnxPath, vocabPath, featurePath: (await existsCached(featurePath)) ? featurePath : undefined }
}
