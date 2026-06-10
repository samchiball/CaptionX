import type {
  ExportOptions,
  HistoryEntryMeta,
  ResplitOptions,
  TranscriptResult
} from '@shared/types'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'

export interface HistoryApi {
  entries: HistoryEntryMeta[]
  loading: boolean
  /** 보관함 목록을 다시 불러온다. */
  refresh: () => Promise<void>
  /** 항목을 삭제하고 목록에서 제거한다. */
  remove: (id: string) => Promise<void>
  /**
   * 항목을 메인 결과 맵에 적재하고 전사 본문을 반환한다.
   * 적재 후에는 resplit·exportEntry 로 후편집과 내보내기가 가능하다.
   */
  load: (id: string) => Promise<TranscriptResult>
  /** 적재된 항목을 다시 분할(후편집)하고 갱신된 본문을 반환한다. */
  resplit: (id: string, options: ResplitOptions) => Promise<TranscriptResult>
  /** 적재된 항목을 자막 파일로 내보낸다 → 저장 경로(취소 시 null). */
  exportEntry: (id: string, options: ExportOptions) => Promise<string | null>
}

export function useHistory(): HistoryApi {
  const [entries, setEntries] = useState<HistoryEntryMeta[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    if (!api.historyList) return
    setLoading(true)
    try {
      setEntries(await api.historyList())
    } finally {
      setLoading(false)
    }
  }, [])

  const remove = useCallback(async (id: string): Promise<void> => {
    await api.historyDelete(id)
    // load 시 동일 id로 메인 결과 맵에 적재됐을 수 있으므로 함께 해제한다.
    void api.releaseResult(id)
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }, [])

  const load = useCallback((id: string) => api.historyLoad(id), [])

  // 적재된 항목은 라이브 작업과 동일하게 resplit/exportSubtitle IPC 로 처리된다.
  const resplit = useCallback(
    (id: string, options: ResplitOptions) => api.resplit(id, options),
    []
  )

  const exportEntry = useCallback(
    (id: string, options: ExportOptions) => api.exportSubtitle(id, options),
    []
  )

  // 최초 마운트 시 한 번 불러온다.
  useEffect(() => {
    void refresh()
  }, [refresh])

  return { entries, loading, refresh, remove, load, resplit, exportEntry }
}
