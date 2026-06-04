// main↔renderer 공유 타입

/** 단어 레벨 타임스탬프 (초 단위) */
export interface Word {
  text: string
  start: number
  end: number
  /** 정렬 신뢰도 0..1 */
  score: number
}

/** Whisper 세그먼트 + wav2vec2 단어 정렬 결과 */
export interface Segment {
  start: number
  end: number
  text: string
  words: Word[]
}

export interface TranscriptResult {
  language: string
  segments: Segment[]
}

export type JobStage = 'decode' | 'transcribe' | 'align' | 'export'

/**
 * 단어 타임스탬프를 만드는 방식.
 * - 'wav2vec2': wav2vec2 강제정렬 모델로 음향 단위 정렬(정밀, 모델 다운로드 필요).
 *   지원 모델이 없는 언어는 세그먼트 텍스트 기반 근사 단어로 자동 폴백한다.
 *
 * 과거 'whisper'(내부 word-level) 모드는 제거됨: max_len=1 토큰 출력이 한·중·일
 * 멀티바이트 글자를 깨뜨려(U+FFFD) 정확도가 낮았고, 전체 오디오를 한 번 더
 * 전사하는 이중 패스라 느렸다.
 */
export type AlignMode = 'wav2vec2' | 'mms'

export interface JobProgress {
  jobId: string
  stage: JobStage
  /** 0..100 */
  pct: number
  message?: string
}

export interface TranscribeOptions {
  /** 입력 미디어 절대 경로 */
  filePath: string
  /** Whisper 모델 이름 (예: 'base', 'small', 'medium', 'large-v3') */
  model: string
  /** 언어 코드 (예: 'ko', 'en'), 미지정 시 자동 감지 */
  language?: string
  /** 단어 강제정렬 수행 여부 */
  align: boolean
  /** 정렬 방식(align=true 일 때 적용). 현재 'wav2vec2'만 지원 */
  alignMode: AlignMode
  /** GPU 사용 시도 여부 (실패 시 CPU 폴백) */
  gpu: boolean
  /** whisper.cpp VAD(voice activity detection) 사용 여부 */
  vad: boolean
  /** GTCRN 음성 향상(잡음/배경음 제거) 사용 여부 */
  denoise: boolean
  /**
   * 핫워드 단어장. 고유명사·전문용어 등 인식이 어려운 단어를 미리 등록하면
   * Whisper의 initial_prompt로 주입돼 해당 단어의 전사 정확도를 높인다.
   */
  hotwords?: string[]
  /**
   * Whisper.cpp 추론 스레드 수(n_threads). 이는 "동시 전사 파일 수"(concurrency)와
   * 다른 개념으로, 단일 전사 한 건이 내부적으로 쓰는 CPU 스레드 수다.
   * 0(또는 미지정)이면 whisper.cpp 기본값(논리 코어 수 기반)을 따른다.
   */
  threads?: number
}

/**
 * 전사 후편집: 단어 타임스탬프를 기준으로 자막을 다시 분할하는 옵션.
 * maxChars 는 한 줄의 권장 글자 수이며, 실제 분할은 침묵 간격·문장부호·조사/어미
 * 흐름을 함께 본다. 문맥이 애매하면 권장 길이를 조금 넘겨 한 문장처럼 유지한다.
 */
export interface ResplitOptions {
  /** 한 자막 줄의 권장 글자 수(공백 포함) */
  maxChars: number
  /** 언어 코드(예: ko, en, ja, zh). 미지정 시 결과 언어 또는 텍스트에서 추정 */
  language?: string
  /** 이 시간(초) 이상 침묵이면 단어 사이를 자연 경계로 본다 */
  minPause?: number
  /** 평균 침묵 대비 이 배수 이상이면 자연 경계로 본다 */
  gapFactor?: number
}

/**
 * 보관함 항목의 메타데이터. 전사 본문(segments) 없이 목록을 가볍게 표시하는 데 쓴다.
 */
export interface HistoryEntryMeta {
  /** 저장 시점의 jobId */
  id: string
  /** 원본 파일 이름(확장자 포함) */
  name: string
  /** 원본 미디어 절대 경로(재생·내보내기 기본 이름용) */
  sourcePath: string
  /** 전사 결과 언어 */
  language: string
  /** 사용한 Whisper 모델 이름 */
  model: string
  /** 저장 시각(epoch ms) */
  createdAt: number
  /** 세그먼트 개수(목록 미리보기용) */
  segmentCount: number
}

/** 보관함에 저장되는 단일 항목(메타 + 전사 본문) */
export interface HistoryEntry {
  meta: HistoryEntryMeta
  result: TranscriptResult
}

export type ExportFormat = 'srt' | 'vtt' | 'json'

export interface ExportOptions {
  format: ExportFormat
  /** 단어 레벨 타임스탬프 포함 (vtt/json) */
  includeWords: boolean
}

/** IPC 채널 이름 상수 */
export const IPC = {
  selectFiles: 'captionx:select-files',
  transcribe: 'captionx:transcribe',
  cancel: 'captionx:cancel',
  exportSubtitle: 'captionx:export',
  progress: 'captionx:progress',
  prepareMedia: 'captionx:prepare-media',
  resplit: 'captionx:resplit',
  getHardwareInfo: 'captionx:get-hardware-info',
  historyList: 'captionx:history-list',
  historyDelete: 'captionx:history-delete',
  historyLoad: 'captionx:history-load',
  getVersion: 'captionx:get-version'
} as const

export interface SystemMemoryInfo {
  total: number // MB
  free: number // MB
}

export interface GpuMemoryInfo {
  name: string
  total: number // MB
  free: number // MB
}

export interface HardwareInfo {
  ram: SystemMemoryInfo
  gpu?: GpuMemoryInfo
}

/** 드롭/선택을 허용하는 미디어 확장자 */
export const MEDIA_EXTENSIONS = [
  'mp3',
  'wav',
  'm4a',
  'flac',
  'ogg',
  'aac',
  'opus',
  'mp4',
  'mkv',
  'mov',
  'webm',
  'avi'
] as const

/** 렌더러에서 로컬 미디어를 재생하기 위한 커스텀 프로토콜 스킴 */
export const MEDIA_SCHEME = 'captionx-media'

/** 경로가 지원 미디어 확장자인지 검사 */
export function isMediaPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return (MEDIA_EXTENSIONS as readonly string[]).includes(ext)
}
