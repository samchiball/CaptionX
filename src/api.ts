/**
 * Tauri invoke-based API layer.
 * Replaces the LEGACY window.api (preload bridge).
 * Callers can simply use the api object in this module.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type {
  AudioTrack,
  DataPathKey,
  DataPaths,
  ExportOptions,
  HardwareInfo,
  HistoryEntryMeta,
  JobProgress,
  ModelDownloadProgress,
  ModelEntry,
  ResplitOptions,
  TranscribeOptions,
  TranscriptResult,
  UpdateStatus,
} from '@shared/types'

export const api = {
  getHardwareInfo: (): Promise<HardwareInfo> =>
    invoke('get_hardware_info'),

  selectFiles: (): Promise<string[]> =>
    invoke('select_files'),

  /** File drop events are handled as Tauri window events — getPathForFile not needed */
  mediaUrl: (filePath: string): string =>
    convertFileSrc(filePath),

  prepareMedia: (filePath: string, trackIndex?: number): Promise<string> =>
    invoke('prepare_media', { filePath, trackIndex }),

  getWaveform: (audioPath: string): Promise<number[]> =>
    invoke('get_waveform', { audioPath }),

  probeTracks: (filePath: string): Promise<AudioTrack[]> =>
    invoke('probe_tracks', { filePath }),

  transcribe: (jobId: string, options: TranscribeOptions): Promise<TranscriptResult> =>
    invoke('transcribe', { jobId, options }),

  cancel: (jobId: string): Promise<void> =>
    invoke('cancel_job', { jobId }),

  releaseResult: (jobId: string): Promise<void> =>
    invoke('release_result', { jobId }),

  exportSubtitle: (jobId: string, options: ExportOptions): Promise<string | null> =>
    invoke('export_subtitle', { jobId, options }),

  resplit: (jobId: string, options: ResplitOptions): Promise<TranscriptResult> =>
    invoke('resplit', { jobId, options }),

  historyList: (): Promise<HistoryEntryMeta[]> =>
    invoke('history_list'),

  historyDelete: (id: string): Promise<void> =>
    invoke('history_delete', { id }),

  historyLoad: (id: string): Promise<TranscriptResult> =>
    invoke('history_load', { id }),

  onProgress: (cb: (p: JobProgress) => void): (() => void) => {
    let unlisten: UnlistenFn | null = null
    listen<JobProgress>('captionx://progress', (event) => cb(event.payload)).then(
      (fn) => { unlisten = fn }
    )
    return () => { unlisten?.() }
  },

  getVersion: (): Promise<string> =>
    invoke('get_version'),

  getDataPaths: (): Promise<DataPaths> =>
    invoke('get_data_paths'),

  openDataPath: (key: DataPathKey): Promise<void> =>
    invoke('open_data_path', { key }),

  updateCheck: (): Promise<UpdateStatus> =>
    invoke('update_check'),

  updateDownload: (): Promise<void> =>
    invoke('update_download'),

  updateInstall: (): Promise<void> =>
    invoke('update_install'),

  updateOpenReleasePage: (): Promise<void> =>
    invoke('update_open_release_page'),

  getModelsDir: (): Promise<string> =>
    invoke('get_models_dir'),

  openModelsDir: (): Promise<void> =>
    invoke('open_models_dir'),

  listModels: (): Promise<ModelEntry[]> =>
    invoke('list_models'),

  downloadModel: (fileName: string): Promise<void> =>
    invoke('download_model', { fileName }),

  cancelDownload: (fileName: string): Promise<void> =>
    invoke('cancel_download', { fileName }),

  deleteModel: (fileName: string): Promise<void> =>
    invoke('delete_model', { fileName }),

  onModelProgress: (cb: (p: ModelDownloadProgress) => void): (() => void) => {
    let unlisten: import('@tauri-apps/api/event').UnlistenFn | null = null
    listen<ModelDownloadProgress>('captionx://model-progress', (event) =>
      cb(event.payload)
    ).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  },

  /** Current OS platform */
  platform: ((): string => {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('win')) return 'win32'
    if (ua.includes('mac')) return 'darwin'
    return 'linux'
  })(),

  onUpdateStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
    let unlisten: UnlistenFn | null = null
    listen<UpdateStatus>('captionx://update-status', (event) => cb(event.payload)).then(
      (fn) => { unlisten = fn }
    )
    return () => { unlisten?.() }
  },

  /** File drop subscription (Tauri DragDropEvent) */
  onFileDrop: (cb: (paths: string[]) => void): (() => void) => {
    let unlisten: UnlistenFn | null = null
    getCurrentWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') {
        cb(event.payload.paths)
      }
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  },
}

export type CaptionXAPI = typeof api
