import type { Segment } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface MediaSync {
  /** 추적할 미디어 엘리먼트에 부착하는 콜백 ref */
  mediaRef: (node: HTMLMediaElement | null) => void
  /** 현재 재생 시각(초) */
  currentTime: number
  /** 현재 시각에 해당하는 세그먼트 인덱스(없으면 -1) */
  activeSegment: number
  /** 활성 세그먼트 내 현재 단어 인덱스(없으면 -1) */
  activeWord: number
  /** 지정 시각으로 점프 후 재생 */
  seekTo: (sec: number) => void
}

/** seekElement가 필요로 하는 미디어 엘리먼트의 최소 인터페이스(테스트용). */
export interface SeekableMedia {
  currentTime: number
  readyState: number
  seekable: { length: number }
  addEventListener: (type: string, listener: () => void) => void
  removeEventListener: (type: string, listener: () => void) => void
}

/**
 * 엘리먼트를 지금 즉시 탐색할 수 있는지 여부.
 * HAVE_METADATA(readyState ≥ 1) 미만이거나 seekable 구간이 비어 있으면
 * `currentTime` 할당이 브라우저에 의해 0으로 무시(클램프)되므로 탐색 불가다.
 */
function canSeekNow(el: SeekableMedia): boolean {
  return el.readyState >= 1 && el.seekable.length > 0
}

/**
 * 미디어 엘리먼트를 sec(초)로 탐색한다.
 *
 * 한 번도 재생하지 않은 `preload="metadata"` 오디오는 seekable 구간이 아직
 * 비어 있어, `currentTime = sec` 할당이 0으로 무시된다(= "클릭 시 무조건 0초로 점프").
 * 그래서 지금 탐색 가능하면 즉시 적용하고, 아니면 데이터가 준비되는(loadedmetadata/
 * canplay) 시점에 한 번 적용한 뒤 리스너를 정리한다.
 */
export function seekElement(el: SeekableMedia, sec: number): void {
  const apply = (): void => {
    try {
      el.currentTime = sec
    } catch {
      /* 준비 전 할당 시 InvalidStateError가 날 수 있어 무시 */
    }
  }

  if (canSeekNow(el)) {
    apply()
    return
  }

  const onReady = (): void => {
    el.removeEventListener('loadedmetadata', onReady)
    el.removeEventListener('canplay', onReady)
    el.removeEventListener('canplaythrough', onReady)
    apply()
  }
  el.addEventListener('loadedmetadata', onReady)
  el.addEventListener('canplay', onReady)
  el.addEventListener('canplaythrough', onReady)
}

/** time이 속한 구간 인덱스를 이진 탐색. 어떤 구간에도 없으면 -1 */
function findActive(items: ReadonlyArray<{ start: number; end: number }>, time: number): number {
  let lo = 0
  let hi = items.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const it = items[mid]
    if (time < it.start) hi = mid - 1
    else if (time >= it.end) lo = mid + 1
    else return mid
  }
  return -1
}

/**
 * 미디어 엘리먼트의 재생 위치를 추적해 현재 세그먼트/단어를 계산한다.
 * 재생 중에는 requestAnimationFrame, 그 외에는 timeupdate/seeked 이벤트로 갱신한다.
 */
export function useMediaSync(segments: Segment[]): MediaSync {
  // 활성 세그먼트/단어 인덱스만 상태로 둔다. 재생 시각(currentTime)은 ref로만
  // 추적해 매 프레임 setState로 인한 전체 재렌더를 피한다. 활성 인덱스는 초당
  // 몇 번만 바뀌므로, 인덱스가 실제로 바뀔 때만 재렌더가 발생한다.
  const [active, setActive] = useState<{ segment: number; word: number }>({
    segment: -1,
    word: -1
  })
  const currentTimeRef = useRef(0)
  // sample 콜백이 항상 최신 segments를 보면서도, segments 변경마다 el 리스너를
  // 재설치하지 않도록 ref로 들고 있는다.
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  // 미디어 엘리먼트는 오디오 준비 후 뒤늦게 마운트되므로, 안정적인 RefObject 대신
  // 콜백 ref로 추적해 엘리먼트가 실제로 나타나면 effect가 재실행되도록 한다.
  const [el, setEl] = useState<HTMLMediaElement | null>(null)
  const mediaRef = useCallback((node: HTMLMediaElement | null) => setEl(node), [])
  const rafRef = useRef<number | null>(null)

  // 현재 시각으로 활성 인덱스를 계산해, 바뀌었을 때만 상태를 갱신한다.
  const syncActive = useCallback((time: number): void => {
    currentTimeRef.current = time
    const segs = segmentsRef.current
    const segment = findActive(segs, time)
    const word = segment >= 0 ? findActive(segs[segment].words, time) : -1
    setActive((prev) => (prev.segment === segment && prev.word === word ? prev : { segment, word }))
  }, [])

  // segments가 교체되면(새 전사 결과) 현재 시각 기준으로 활성 인덱스를 재계산한다.
  // syncActive는 안정적(useCallback, 빈 deps)이라 의존성에서 제외한다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: syncActive는 불변
  useEffect(() => {
    syncActive(currentTimeRef.current)
  }, [segments])

  useEffect(() => {
    if (!el) return

    const sample = (): void => syncActive(el.currentTime)

    const loop = (): void => {
      sample()
      rafRef.current = requestAnimationFrame(loop)
    }
    const startLoop = (): void => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop)
    }
    const stopLoop = (): void => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      sample()
    }

    el.addEventListener('play', startLoop)
    el.addEventListener('playing', startLoop)
    el.addEventListener('pause', stopLoop)
    el.addEventListener('ended', stopLoop)
    el.addEventListener('seeked', sample)
    el.addEventListener('timeupdate', sample)
    el.addEventListener('loadedmetadata', sample)

    return () => {
      stopLoop()
      el.removeEventListener('play', startLoop)
      el.removeEventListener('playing', startLoop)
      el.removeEventListener('pause', stopLoop)
      el.removeEventListener('ended', stopLoop)
      el.removeEventListener('seeked', sample)
      el.removeEventListener('timeupdate', sample)
      el.removeEventListener('loadedmetadata', sample)
    }
  }, [el, syncActive])

  const seekTo = useCallback(
    (sec: number): void => {
      if (!el) return
      // 재생을 먼저 시작하면 버퍼링이 트리거되어 seekable 구간이 채워지고,
      // 아직 준비 전이라도 seekElement가 canplay 시점에 탐색을 적용한다.
      void el.play().catch(() => {
        /* 사용자 제스처 없이 자동재생 차단 시 무시 */
      })
      seekElement(el, sec)
      syncActive(sec)
    },
    [el, syncActive]
  )

  return {
    mediaRef,
    currentTime: currentTimeRef.current,
    activeSegment: active.segment,
    activeWord: active.word,
    seekTo
  }
}

export { findActive }
