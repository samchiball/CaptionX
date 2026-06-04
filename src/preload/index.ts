import { electronAPI } from '@electron-toolkit/preload'
import {
  type DataPathKey,
  type DataPaths,
  type ExportOptions,
  type HardwareInfo,
  type HistoryEntryMeta,
  IPC,
  type JobProgress,
  MEDIA_SCHEME,
  type ResplitOptions,
  type TranscribeOptions,
  type TranscriptResult
} from '@shared/types'
import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  /** 하드웨어 정보 (시스템 RAM 및 GPU VRAM) 가져오기 */
  getHardwareInfo: (): Promise<HardwareInfo> => ipcRenderer.invoke(IPC.getHardwareInfo),

  /** 파일 선택 다이얼로그(다중 선택) → 선택된 절대 경로 배열 */
  selectFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.selectFiles),

  /**
   * 드롭된 File 객체에서 실제 파일 시스템 경로를 얻는다.
   * Electron 32+에서 File.path가 제거되어 webUtils를 사용한다.
   */
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),

  /**
   * 로컬 미디어 절대 경로를 렌더러 <video>/<audio>에서 재생 가능한
   * 커스텀 프로토콜 URL로 변환한다.
   */
  mediaUrl: (filePath: string): string => `${MEDIA_SCHEME}://file/${encodeURIComponent(filePath)}`,

  /**
   * 재생용 오디오를 브라우저 호환 형식(m4a)으로 추출하고 그 절대 경로를 받는다.
   * 원본 영상 코덱이 디코드 불가여도 타이밍 검증용 오디오 재생을 보장한다.
   */
  prepareMedia: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.prepareMedia, filePath),

  /** 전사 시작. jobId는 호출자가 생성해 전달(진행률 매칭용). */
  transcribe: (jobId: string, options: TranscribeOptions): Promise<TranscriptResult> =>
    ipcRenderer.invoke(IPC.transcribe, jobId, options),

  /** 진행 중인 작업 취소 */
  cancel: (jobId: string): Promise<void> => ipcRenderer.invoke(IPC.cancel, jobId),

  /** 더 이상 쓰지 않는 전사 결과를 메인 메모리에서 해제(큐 제거·보관함 항목 삭제 시). */
  releaseResult: (jobId: string): Promise<void> => ipcRenderer.invoke(IPC.releaseResult, jobId),

  /** 자막 파일 내보내기 → 저장된 경로(취소 시 null) */
  exportSubtitle: (jobId: string, options: ExportOptions): Promise<string | null> =>
    ipcRenderer.invoke(IPC.exportSubtitle, jobId, options),

  /** 전사 결과를 단어 단위로 다시 분할 → 재분할된 결과(내보내기 저장본도 갱신) */
  resplit: (jobId: string, options: ResplitOptions): Promise<TranscriptResult> =>
    ipcRenderer.invoke(IPC.resplit, jobId, options),

  /** 보관함 목록(메타데이터, 최신순) */
  historyList: (): Promise<HistoryEntryMeta[]> => ipcRenderer.invoke(IPC.historyList),

  /** 보관함 항목 삭제 */
  historyDelete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.historyDelete, id),

  /** 보관함 항목을 결과 맵에 적재(후편집·내보내기 준비) → 전사 본문 */
  historyLoad: (id: string): Promise<TranscriptResult> => ipcRenderer.invoke(IPC.historyLoad, id),

  /** 진행률 구독. 해제 함수 반환 */
  onProgress: (cb: (p: JobProgress) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, p: JobProgress): void => cb(p)
    ipcRenderer.on(IPC.progress, listener)
    return () => ipcRenderer.removeListener(IPC.progress, listener)
  },

  /** 앱 버전 가져오기 */
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.getVersion),

  /** 입력 데이터(보관함·오디오 캐시) 저장 경로 가져오기 */
  getDataPaths: (): Promise<DataPaths> => ipcRenderer.invoke(IPC.getDataPaths),

  /** 지정한 데이터 저장소를 파일 탐색기에서 열기 */
  openDataPath: (key: DataPathKey): Promise<void> => ipcRenderer.invoke(IPC.openDataPath, key)
}

export type CaptionXAPI = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electron', electronAPI)
  contextBridge.exposeInMainWorld('api', api)
} else {
  // contextIsolation 비활성 시 폴백
  const g = globalThis as unknown as Record<string, unknown>
  g.electron = electronAPI
  g.api = api
}
