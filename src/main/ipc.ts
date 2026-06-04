import { writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { HardwareInfo } from '@shared/types'
import {
  type ExportOptions,
  type HistoryEntryMeta,
  IPC,
  type JobProgress,
  MEDIA_EXTENSIONS,
  type ResplitOptions,
  type TranscribeOptions,
  type TranscriptResult
} from '@shared/types'
import { app, BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain } from 'electron'
import { preparePreviewAudio } from './audio/preview'
import { resplitResult } from './edit/resplit'
import { extensionFor, serialize } from './export/subtitle'
import { deleteEntry, getEntry, historyDir, listEntries, saveEntry } from './history/store'
import { isCancellation, runTranscription } from './pipeline'
import { getHardwareInfo } from './systemInfo'

/** jobId → 전사 결과 (내보내기 단계에서 재사용) */
const results = new Map<
  string,
  { originalResult: TranscriptResult; currentResult: TranscriptResult; sourcePath: string }
>()

/** 진행 중인 작업의 중단 컨트롤러 (jobId → AbortController). 취소 요청 시 abort 한다. */
const inFlight = new Map<string, AbortController>()

/** 이벤트 발신 webContents가 속한 윈도우(다이얼로그 부모용) */
function windowOf(event: IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

/**
 * 저장 다이얼로그를 띄워 자막을 파일로 내보낸다. 큐·보관함 양쪽에서 공유한다.
 * 사용자가 취소하면 null 을 반환한다.
 */
async function saveSubtitleViaDialog(
  event: IpcMainInvokeEvent,
  sourcePath: string,
  result: TranscriptResult,
  options: ExportOptions
): Promise<string | null> {
  const base = basename(sourcePath, extname(sourcePath))
  const parent = windowOf(event)
  const opts = {
    defaultPath: `${base}${extensionFor(options.format)}`,
    filters: [{ name: options.format.toUpperCase(), extensions: [options.format] }]
  }
  const { canceled, filePath } = parent
    ? await dialog.showSaveDialog(parent, opts)
    : await dialog.showSaveDialog(opts)
  if (canceled || !filePath) return null
  const content = serialize(result, options.format, options.includeWords)
  await writeFile(filePath, content, 'utf-8')
  return filePath
}

/**
 * IPC 핸들러를 1회 등록한다(채널당 단일 핸들러).
 * 진행률은 요청을 보낸 렌더러(event.sender)로 되돌려 보낸다.
 */
export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.getHardwareInfo, async (): Promise<HardwareInfo> => {
    return getHardwareInfo()
  })

  ipcMain.handle(IPC.getVersion, (): string => {
    return app.getVersion()
  })

  ipcMain.handle(IPC.selectFiles, async (event): Promise<string[]> => {
    const parent = windowOf(event)
    const opts = {
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [{ name: '미디어 파일', extensions: [...MEDIA_EXTENSIONS] }]
    }
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, opts)
      : await dialog.showOpenDialog(opts)
    return canceled ? [] : filePaths
  })

  ipcMain.handle(
    IPC.transcribe,
    async (event, jobId: string, options: TranscribeOptions): Promise<TranscriptResult> => {
      // 같은 jobId의 이전 컨트롤러가 남아 있으면 정리한다.
      inFlight.get(jobId)?.abort()
      const controller = new AbortController()
      inFlight.set(jobId, controller)
      try {
        const result = await runTranscription(
          options,
          (p) => {
            const progress: JobProgress = { jobId, ...p }
            if (!event.sender.isDestroyed()) event.sender.send(IPC.progress, progress)
          },
          controller.signal
        )
        results.set(jobId, {
          originalResult: result,
          currentResult: result,
          sourcePath: options.filePath
        })
        // 전사 결과를 보관함에 저장한다. 저장 실패가 전사 자체를 깨뜨리지 않도록 격리한다.
        try {
          const meta: HistoryEntryMeta = {
            id: jobId,
            name: basename(options.filePath),
            sourcePath: options.filePath,
            language: result.language,
            model: options.model,
            createdAt: Date.now(),
            segmentCount: result.segments.length
          }
          await saveEntry(historyDir(), meta, result)
        } catch (err) {
          console.error('[history] 저장 실패', err)
        }
        return result
      } catch (err) {
        // 취소는 일관된 에러 메시지로 전달해 렌더러가 구분할 수 있게 한다.
        if (isCancellation(err)) throw new Error('작업이 취소되었습니다.')
        throw err
      } finally {
        // 동일 jobId가 재시작으로 교체되지 않았을 때만 정리한다.
        if (inFlight.get(jobId) === controller) inFlight.delete(jobId)
      }
    }
  )

  ipcMain.handle(
    IPC.prepareMedia,
    async (_event, filePath: string): Promise<string> => preparePreviewAudio(filePath)
  )

  ipcMain.handle(
    IPC.resplit,
    async (_event, jobId: string, options: ResplitOptions): Promise<TranscriptResult> => {
      const entry = results.get(jobId)
      if (!entry) throw new Error('재분할할 전사 결과를 찾을 수 없습니다.')
      const result = resplitResult(entry.originalResult, options)
      // 내보내기가 재분할 결과를 쓰도록 저장본을 갱신한다.
      results.set(jobId, {
        originalResult: entry.originalResult,
        currentResult: result,
        sourcePath: entry.sourcePath
      })
      return result
    }
  )

  ipcMain.handle(IPC.cancel, async (_event, jobId: string): Promise<void> => {
    // 해당 작업의 중단 신호를 켠다. 파이프라인이 다음 체크포인트에서 중단된다.
    inFlight.get(jobId)?.abort()
  })

  ipcMain.handle(
    IPC.exportSubtitle,
    async (event, jobId: string, options: ExportOptions): Promise<string | null> => {
      const entry = results.get(jobId)
      if (!entry) throw new Error('내보낼 전사 결과를 찾을 수 없습니다.')
      return saveSubtitleViaDialog(event, entry.sourcePath, entry.currentResult, options)
    }
  )

  ipcMain.handle(IPC.historyList, async (): Promise<HistoryEntryMeta[]> => {
    return listEntries(historyDir())
  })

  ipcMain.handle(IPC.historyDelete, async (_event, id: string): Promise<void> => {
    await deleteEntry(historyDir(), id)
  })

  // 보관함 항목을 메모리 결과 맵에 적재한다. 이후 기존 resplit/export 핸들러가
  // 라이브 작업과 동일하게 동작하므로 후편집·내보내기를 그대로 재사용할 수 있다.
  ipcMain.handle(IPC.historyLoad, async (_event, id: string): Promise<TranscriptResult> => {
    const entry = await getEntry(historyDir(), id)
    if (!entry) throw new Error('불러올 보관함 항목을 찾을 수 없습니다.')
    results.set(id, {
      originalResult: entry.result,
      currentResult: entry.result,
      sourcePath: entry.meta.sourcePath
    })
    return entry.result
  })
}
