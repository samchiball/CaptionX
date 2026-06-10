// Frontend↔Backend shared types (Tauri 2 version)

/** Word-level timestamp (in seconds) */
export interface Word {
  text: string
  start: number
  end: number
  /** Alignment confidence score 0..1 */
  score: number
}

/** Whisper segment + wav2vec2 word alignment results */
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

/**
 * Metadata of a single audio track (stream) of the input media.
 */
export interface AudioTrack {
  index: number
  codec: string
  channels: number
  language?: string
  title?: string
}

export type JobStage = 'decode' | 'transcribe' | 'align' | 'export'

export interface JobProgress {
  jobId: string
  stage: JobStage
  /** Progress percentage (0..100) */
  pct: number
  message?: string
}

/**
 * Method for generating word-level timestamps.
 * - 'wav2vec2': wav2vec2 forced alignment (precise, model download required)
 * - 'mms': MMS model-based alignment
 */
export type AlignMode = 'wav2vec2' | 'mms'

export interface TranscribeOptions {
  filePath: string
  audioTrackIndex?: number
  audioTrackIndices?: number[]
  model: string
  language?: string
  align: boolean
  alignMode: AlignMode
  gpu: boolean
  vad: boolean
  denoise: boolean
  hotwords?: string[]
  threads?: number
}

/**
 * Post-transcription editing: options for resplitting subtitles based on word timestamps.
 */
export interface ResplitOptions {
  maxChars: number
  language?: string
  minPause?: number
  gapFactor?: number
}

export interface HistoryEntryMeta {
  id: string
  name: string
  sourcePath: string
  language: string
  model: string
  createdAt: number
  segmentCount: number
}

export interface HistoryEntry {
  meta: HistoryEntryMeta
  result: TranscriptResult
}

export type ExportFormat = 'srt' | 'vtt' | 'json'

export interface ExportOptions {
  format: ExportFormat
  includeWords: boolean
}

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

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  version?: string
  percent?: number
  message?: string
}

export type DataPathKey = 'history' | 'audioCache'
export type DataPaths = Record<DataPathKey, string>

export interface ModelEntry {
  name: string
  fileName: string
  sizeBytes: number
  present: boolean
  downloadable: boolean
}

export interface ModelDownloadProgress {
  name: string
  downloaded: number
  total: number
  done: boolean
  error?: string
}

export const MEDIA_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'opus',
  'mp4', 'mkv', 'mov', 'webm', 'avi'
] as const

export function isMediaPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return (MEDIA_EXTENSIONS as readonly string[]).includes(ext)
}
