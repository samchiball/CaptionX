import type {
  AudioTrack,
  ExportOptions,
  JobProgress,
  ResplitOptions,
  TranscribeOptions,
  TranscriptResult
} from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'

export type ItemStatus = 'pending' | 'running' | 'done' | 'error' | 'canceled'
export type RunnableItemStatus = Exclude<ItemStatus, 'running'>
// 동시에 전사할 "파일 수"의 허용 범위. whisper 자체의 배치 추론과는 무관한 파일 동시성이다.
export const MIN_CONCURRENCY = 1
export const MAX_CONCURRENCY = 32
// whisper.cpp 추론 스레드 수(n_threads) 허용 범위. 0은 "자동"(기본값 사용)을 뜻한다.
export const MIN_THREADS = 0
export const MAX_THREADS = 32

/** whisper 스레드 수를 허용 범위로 클램프한다(0=자동). */
export function normalizeThreads(value: number): number {
  if (!Number.isFinite(value)) return MIN_THREADS
  return Math.min(MAX_THREADS, Math.max(MIN_THREADS, Math.floor(value)))
}

export interface QueueItem {
  /** 로컬 고유 id = jobId (진행률 매칭) */
  id: string
  filePath: string
  name: string
  status: ItemStatus
  progress: JobProgress | null
  result: TranscriptResult | null
  error: string | null
  /** 처리 시작 시각(epoch ms). 경과 시간·ETA 계산용. 미시작이면 null. */
  startedAt: number | null
  /**
   * 파일의 오디오 트랙 목록. null=아직 조사 전, []=오디오 없음/조사 실패.
   * 길이가 2 이상이면 멀티트랙이므로 사용자가 전사·모니터링 트랙을 고를 수 있다.
   */
  tracks: AudioTrack[] | null
  /** 전사·모니터링에 쓸 선택 트랙 순번(0부터). 멀티트랙일 때만 의미가 있다. */
  trackIndex: number
}

export type RunSettings = Omit<TranscribeOptions, 'filePath'> & {
  /** 동시에 전사할 파일 수(whisper 배치 추론이 아니라 파일 레벨 동시성) */
  concurrency: number
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function uid(): string {
  return crypto.randomUUID()
}

export function isRunnableStatus(status: ItemStatus): status is RunnableItemStatus {
  return status !== 'running'
}

export function normalizeConcurrency(value: number): number {
  if (!Number.isFinite(value)) return MIN_CONCURRENCY
  return Math.min(MAX_CONCURRENCY, Math.max(MIN_CONCURRENCY, Math.floor(value)))
}

/**
 * 항목을 워커가 가져갈(claim) 수 있는지 판별한다(순수 함수).
 * 대기 상태이면서 아직 누군가 가져가지 않았고 취소되지도 않은 항목만 처리 대상이다.
 */
export function canClaim(
  item: QueueItem,
  claimed: ReadonlySet<string>,
  canceled: ReadonlySet<string>
): boolean {
  return item.status === 'pending' && !claimed.has(item.id) && !canceled.has(item.id)
}

export async function runConcurrent<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  const limit = normalizeConcurrency(concurrency)
  let index = 0

  async function next(): Promise<void> {
    const item = items[index]
    index += 1
    if (item === undefined) return
    await worker(item)
    await next()
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
}

export interface BatchApi {
  items: QueueItem[]
  /** 처리 중인 작업이 있는지 */
  busy: boolean
  addPaths: (paths: string[]) => void
  /** 멀티트랙 항목의 전사·모니터링 대상 트랙을 바꾼다. */
  setTrack: (id: string, trackIndex: number) => void
  /** 멀티트랙 동영상에서 다른 오디오 트랙 전사를 위해 큐 항목을 복제 추가한다. */
  addTrackItem: (filePath: string, trackIndex: number, tracks: AudioTrack[]) => void
  remove: (id: string) => void
  clearDone: () => void
  runAll: (settings: RunSettings) => Promise<void>
  /** 단일 작업 취소(진행 중·대기 모두) */
  cancel: (id: string) => void
  /** 진행 중·대기 중인 모든 작업 취소 */
  cancelAll: () => void
  exportItem: (id: string, options: ExportOptions) => Promise<string | null>
  resplitItem: (id: string, options: ResplitOptions) => Promise<void>
}

export function useBatch(): BatchApi {
  const [items, setItems] = useState<QueueItem[]>([])
  const [busy, setBusy] = useState(false)
  const itemsRef = useRef<QueueItem[]>([])
  itemsRef.current = items
  // 사용자가 취소한 jobId 집합. transcribe 거부를 오류가 아닌 '취소'로 분류하는 데 쓴다.
  const canceledRef = useRef<Set<string>>(new Set())
  // 워커가 이미 가져간(claim) jobId 집합. 동일 항목 중복 처리를 막는다.
  const claimedRef = useRef<Set<string>>(new Set())
  // 현재 실행 세션이 활성 상태인지. 활성 중에는 새로 추가된 파일도 자동으로 처리한다.
  const runningRef = useRef(false)
  // 현재 실행 세션의 전사 설정. 실행 중 추가된 파일도 같은 설정으로 처리한다.
  const runSettingsRef = useRef<Omit<TranscribeOptions, 'filePath'> | null>(null)
  // 동시 처리 한도(동시에 전사할 파일 수).
  const concurrencyRef = useRef<number>(MIN_CONCURRENCY)
  // 현재 가동 중인 워커 수.
  const activeWorkersRef = useRef(0)

  const patch = useCallback((id: string, p: Partial<QueueItem>): void => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it)))
  }, [])

  // 진행률 이벤트 → 해당 항목에 반영
  useEffect(() => {
    return api.onProgress((pr: JobProgress) => {
      setItems((prev) => prev.map((it) => (it.id === pr.jobId ? { ...it, progress: pr } : it)))
    })
  }, [])

  // 아직 가져가지 않은 다음 대기 항목을 찾아 claim 한다. 없으면 undefined.
  const claimNext = useCallback((): QueueItem | undefined => {
    for (const it of itemsRef.current) {
      if (canClaim(it, claimedRef.current, canceledRef.current)) {
        claimedRef.current.add(it.id)
        return it
      }
    }
    return undefined
  }, [])

  const processItem = useCallback(
    async (item: QueueItem): Promise<void> => {
      // 시작 전에 이미 취소된 항목(대기 중 전체 취소 등)은 건너뛴다.
      if (canceledRef.current.has(item.id)) {
        patch(item.id, { status: 'canceled', progress: null })
        return
      }
      const settings = runSettingsRef.current
      if (settings === null) return
      patch(item.id, {
        status: 'running',
        progress: null,
        result: null,
        error: null,
        startedAt: Date.now()
      })
      try {
        // 멀티트랙 파일만 트랙 순번을 넘긴다. 단일/미상 트랙은 ffmpeg 기본 선택에 맡긴다.
        const multiTrack = (item.tracks?.length ?? 0) > 1
        const result = await api.transcribe(item.id, {
          filePath: item.filePath,
          ...settings,
          audioTrackIndex: multiTrack ? item.trackIndex : undefined
        })
        patch(item.id, { status: 'done', result, progress: null })
      } catch (err) {
        // 사용자가 취소한 작업은 오류가 아닌 '취소'로 표시한다.
        if (canceledRef.current.has(item.id)) {
          patch(item.id, { status: 'canceled', progress: null, error: null })
        } else {
          // Tauri invoke 오류는 Error 객체가 아니라 문자열로 전달된다
          const msg = err instanceof Error ? err.message : String(err ?? '알 수 없는 오류')
          patch(item.id, { status: 'error', error: msg, progress: null })
        }
      }
    },
    [patch]
  )

  // 대기 항목이 없을 때까지 계속 claim 해 처리하는 워커. 마지막 워커가 끝나면 세션을 종료한다.
  const spawnWorker = useCallback((): void => {
    activeWorkersRef.current += 1
    void (async (): Promise<void> => {
      try {
        for (;;) {
          const item = claimNext()
          if (item === undefined) break
          await processItem(item)
        }
      } finally {
        activeWorkersRef.current -= 1
        if (activeWorkersRef.current === 0) {
          runningRef.current = false
          setBusy(false)
        }
      }
    })()
  }, [claimNext, processItem])

  // 실행 세션이 활성인 동안, 한도까지 워커를 채운다(대기 항목이 있을 때만).
  const ensureWorkers = useCallback((): void => {
    if (!runningRef.current) return
    while (
      activeWorkersRef.current < concurrencyRef.current &&
      itemsRef.current.some((it) => canClaim(it, claimedRef.current, canceledRef.current))
    ) {
      spawnWorker()
    }
  }, [spawnWorker])

  const addPaths = useCallback(
    (paths: string[]): void => {
      const existing = new Set(itemsRef.current.map((it) => it.filePath))
      const next = paths
        .filter((p) => !existing.has(p))
        .map<QueueItem>((p) => ({
          id: uid(),
          filePath: p,
          name: baseName(p),
          status: 'pending',
          progress: null,
          result: null,
          error: null,
          startedAt: null,
          tracks: null,
          trackIndex: 0
        }))
      if (next.length === 0) return
      // 새로 추가된 파일을 큐 상단에 배치한다(최근 추가가 위로 보이도록).
      const merged = [...next, ...itemsRef.current]
      // itemsRef 를 즉시 갱신해, 실행 중이면 ensureWorkers 가 새 항목을 바로 인식하도록 한다.
      itemsRef.current = merged
      setItems(merged)
      // 각 신규 파일의 오디오 트랙을 백그라운드로 조사한다. 멀티트랙이면 선택 UI가 뜬다.
      // 조사 실패는 단일 트랙처럼 취급(빈 배열)해 전사 흐름을 막지 않는다.
      for (const it of next) {
        api
          .probeTracks(it.filePath)
          .then((tracks) => patch(it.id, { tracks }))
          .catch(() => patch(it.id, { tracks: [] }))
      }
      // 실행 세션이 활성이면 새로 추가된 파일을 즉시 큐에 태워 처리한다.
      ensureWorkers()
    },
    [ensureWorkers, patch]
  )

  const setTrack = useCallback((id: string, trackIndex: number): void => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === id) {
          const base = it.name.replace(/\s*\(Track\s+\d+\)$/i, '')
          return {
            ...it,
            trackIndex,
            name: `${base} (Track ${trackIndex + 1})`
          }
        }
        return it
      })
    )
  }, [])

  const addTrackItem = useCallback(
    (filePath: string, trackIndex: number, tracks: AudioTrack[]): void => {
      const existing = itemsRef.current.find(
        (it) => it.filePath === filePath && it.trackIndex === trackIndex
      )
      if (existing) return

      const name = baseName(filePath)
      const newItem: QueueItem = {
        id: uid(),
        filePath,
        name: `${name} (Track ${trackIndex + 1})`,
        status: 'pending',
        progress: null,
        result: null,
        error: null,
        startedAt: null,
        tracks,
        trackIndex
      }

      const merged = [...itemsRef.current, newItem]
      itemsRef.current = merged
      setItems(merged)
    },
    []
  )

  const remove = useCallback((id: string): void => {
    // 메인 프로세스의 전사 결과(내보내기·후편집용)도 함께 해제해 메모리 누적을 막는다.
    void api.releaseResult(id)
    setItems((prev) => prev.filter((it) => it.id !== id))
  }, [])

  const clearDone = useCallback((): void => {
    for (const it of itemsRef.current) {
      if (it.status === 'done') void api.releaseResult(it.id)
    }
    setItems((prev) => prev.filter((it) => it.status !== 'done'))
  }, [])

  const runAll = useCallback(
    async (settings: RunSettings): Promise<void> => {
      const { concurrency, ...transcribeSettings }: RunSettings = settings
      // 새 실행 시작 시 이전 세션의 취소·claim 표시를 비운다.
      canceledRef.current.clear()
      claimedRef.current.clear()
      runSettingsRef.current = transcribeSettings
      concurrencyRef.current = normalizeConcurrency(concurrency)

      // 실행 가능한 항목(완료/오류/취소 포함)을 모두 대기 상태로 되돌려 현재 설정으로 재전사한다.
      const reset = itemsRef.current.map<QueueItem>((it) =>
        isRunnableStatus(it.status)
          ? { ...it, status: 'pending', progress: null, result: null, error: null, startedAt: null }
          : it
      )
      itemsRef.current = reset
      setItems(reset)

      runningRef.current = true
      setBusy(true)
      // 한도까지 워커를 채운다. 이후 추가되는 파일은 addPaths → ensureWorkers 로 처리된다.
      ensureWorkers()
    },
    [ensureWorkers]
  )

  const cancel = useCallback(
    (id: string): void => {
      const item = itemsRef.current.find((it) => it.id === id)
      // 진행 중·대기 중인 작업만 취소 대상이다.
      if (!item || (item.status !== 'running' && item.status !== 'pending')) return
      canceledRef.current.add(id)
      if (item.status === 'running') {
        // 메인 파이프라인에 중단 신호를 보낸다. 거부는 runAll 워커가 '취소'로 분류한다.
        // 즉시 '취소' 상태로 표시해 체감 반응성을 높인다(워커 거부 시에도 동일 상태로 수렴).
        patch(id, { status: 'canceled', progress: null })
        void api.cancel(id)
      } else {
        // 아직 시작 안 한 항목은 즉시 취소 표시(워커가 시작 시 건너뜀).
        patch(id, { status: 'canceled', progress: null })
      }
    },
    [patch]
  )

  const cancelAll = useCallback((): void => {
    for (const item of itemsRef.current) {
      if (item.status === 'running' || item.status === 'pending') cancel(item.id)
    }
  }, [cancel])

  const exportItem = useCallback(
    async (id: string, options: ExportOptions): Promise<string | null> => {
      const item = itemsRef.current.find((it) => it.id === id)
      if (item?.status !== 'done') return null
      return api.exportSubtitle(id, options)
    },
    []
  )

  const resplitItem = useCallback(
    async (id: string, options: ResplitOptions): Promise<void> => {
      const item = itemsRef.current.find((it) => it.id === id)
      if (item?.status !== 'done') return
      const result = await api.resplit(id, options)
      patch(id, { result })
    },
    [patch]
  )

  return {
    items,
    busy,
    addPaths,
    setTrack,
    addTrackItem,
    remove,
    clearDone,
    runAll,
    cancel,
    cancelAll,
    exportItem,
    resplitItem
  }
}
