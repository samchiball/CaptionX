import { describe, expect, it } from 'vitest'
import {
  canClaim,
  type ItemStatus,
  isRunnableStatus,
  MAX_CONCURRENCY,
  MIN_CONCURRENCY,
  normalizeConcurrency,
  type QueueItem,
  runConcurrent
} from './useBatch'

function makeItem(id: string, status: ItemStatus): QueueItem {
  return {
    id,
    filePath: `/tmp/${id}.mp4`,
    name: `${id}.mp4`,
    status,
    progress: null,
    result: null,
    error: null,
    startedAt: null
  }
}

describe('isRunnableStatus', () => {
  it('처리 중인 항목만 재실행 대상에서 제외한다', () => {
    expect(isRunnableStatus('running')).toBe(false)
    expect(isRunnableStatus('pending')).toBe(true)
    expect(isRunnableStatus('done')).toBe(true)
    expect(isRunnableStatus('error')).toBe(true)
    // 취소된 항목은 현재 설정으로 다시 실행할 수 있어야 한다.
    expect(isRunnableStatus('canceled')).toBe(true)
  })
})

describe('normalizeConcurrency', () => {
  it('동시 전사 수를 허용 범위의 정수로 보정한다', () => {
    expect(normalizeConcurrency(0)).toBe(MIN_CONCURRENCY)
    expect(normalizeConcurrency(2.8)).toBe(2)
    expect(normalizeConcurrency(Number.NaN)).toBe(MIN_CONCURRENCY)
    expect(normalizeConcurrency(MAX_CONCURRENCY + 10)).toBe(MAX_CONCURRENCY)
  })
})

describe('canClaim', () => {
  const empty = new Set<string>()

  it('대기 중이고 아직 가져가지 않은 항목만 처리 대상이다', () => {
    expect(canClaim(makeItem('a', 'pending'), empty, empty)).toBe(true)
  })

  it('이미 가져간(claim) 항목은 중복 처리하지 않는다', () => {
    expect(canClaim(makeItem('a', 'pending'), new Set(['a']), empty)).toBe(false)
  })

  it('취소된 항목은 처리하지 않는다', () => {
    expect(canClaim(makeItem('a', 'pending'), empty, new Set(['a']))).toBe(false)
  })

  it('대기 상태가 아닌 항목은 처리하지 않는다', () => {
    expect(canClaim(makeItem('a', 'running'), empty, empty)).toBe(false)
    expect(canClaim(makeItem('a', 'done'), empty, empty)).toBe(false)
  })
})

describe('동적 큐 동시 처리 시뮬레이션', () => {
  // useBatch 의 워커 풀과 동일한 규칙(claim + 한도)으로 스케줄러를 재현해
  // "여러 파일 동시 전사"와 "실행 중 추가된 항목 처리"를 검증한다.
  async function simulate(
    initial: QueueItem[],
    concurrency: number,
    onStart?: (claimedSoFar: number, add: (item: QueueItem) => void) => void
  ): Promise<{ processed: string[]; peakConcurrency: number }> {
    const items = [...initial]
    const claimed = new Set<string>()
    const canceled = new Set<string>()
    const processed: string[] = []
    let active = 0
    let peak = 0
    let started = 0

    const add = (item: QueueItem): void => {
      items.push(item)
    }
    const claimNext = (): QueueItem | undefined => {
      for (const it of items) {
        if (canClaim(it, claimed, canceled)) {
          claimed.add(it.id)
          return it
        }
      }
      return undefined
    }

    const spawn = (): void => {
      active += 1
      void (async (): Promise<void> => {
        try {
          for (;;) {
            const item = claimNext()
            if (item === undefined) break
            peak = Math.max(peak, active)
            started += 1
            onStart?.(started, add)
            await Promise.resolve()
            item.status = 'done'
            processed.push(item.id)
            ensure()
          }
        } finally {
          active -= 1
        }
      })()
    }
    const ensure = (): void => {
      while (active < concurrency && items.some((it) => canClaim(it, claimed, canceled))) {
        spawn()
      }
    }

    ensure()
    // 모든 비동기 워커가 끝날 때까지 이벤트 루프를 비운다.
    while (active > 0) await Promise.resolve()
    return { processed, peakConcurrency: peak }
  }

  it('배치 크기만큼 파일을 동시에 처리한다', async () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => makeItem(id, 'pending'))
    const { processed, peakConcurrency } = await simulate(items, 3)
    expect(processed.sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(peakConcurrency).toBe(3)
  })

  it('처리 도중 추가된 파일도 같은 실행에서 전사한다', async () => {
    const items = [makeItem('a', 'pending'), makeItem('b', 'pending')]
    let injected = false
    const { processed } = await simulate(items, 2, (_n, add) => {
      // 첫 항목 처리 시작 시 새 파일을 큐에 추가한다(전사 도중 추가 시나리오).
      if (!injected) {
        injected = true
        add(makeItem('late', 'pending'))
      }
    })
    expect(processed).toContain('late')
    expect(processed.sort()).toEqual(['a', 'b', 'late'])
  })
})

describe('runConcurrent', () => {
  it('지정된 배치 사이즈 이상으로 동시에 실행하지 않는다', async () => {
    let active = 0
    let peak = 0

    await runConcurrent([1, 2, 3, 4, 5], 2, async () => {
      active += 1
      peak = Math.max(peak, active)
      await Promise.resolve()
      active -= 1
    })

    expect(peak).toBe(2)
  })

  it('모든 항목을 처리한다', async () => {
    const processed: number[] = []

    await runConcurrent([1, 2, 3], 2, async (item) => {
      processed.push(item)
    })

    expect(processed.sort()).toEqual([1, 2, 3])
  })
})
