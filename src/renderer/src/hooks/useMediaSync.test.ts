import { describe, expect, it } from 'vitest'
import { findActive, type SeekableMedia, seekElement } from './useMediaSync'

/** 이벤트 리스너를 수동으로 발화할 수 있는 가짜 미디어 엘리먼트. */
function fakeMedia(init: { readyState: number; seekableLength: number }): SeekableMedia & {
  fire: (type: string) => void
  listeners: Record<string, Set<() => void>>
} {
  const listeners: Record<string, Set<() => void>> = {}
  return {
    currentTime: 0,
    readyState: init.readyState,
    seekable: { length: init.seekableLength },
    listeners,
    addEventListener(type, listener) {
      listeners[type] ??= new Set()
      listeners[type].add(listener)
    },
    removeEventListener(type, listener) {
      listeners[type]?.delete(listener)
    },
    fire(type) {
      for (const l of [...(listeners[type] ?? [])]) l()
    }
  }
}

const items = [
  { start: 0, end: 1 },
  { start: 1, end: 2.5 },
  { start: 3, end: 4 } // 2.5~3 사이 공백
]

describe('findActive', () => {
  it('구간 시작(포함) 시각을 해당 인덱스로 찾는다', () => {
    expect(findActive(items, 0)).toBe(0)
    expect(findActive(items, 1)).toBe(1)
    expect(findActive(items, 3)).toBe(2)
  })

  it('구간 내부 시각을 찾는다', () => {
    expect(findActive(items, 0.5)).toBe(0)
    expect(findActive(items, 2.4)).toBe(1)
  })

  it('구간 끝(미포함) 시각은 다음/없음으로 처리한다', () => {
    expect(findActive(items, 1)).toBe(1) // 0번 끝=1번 시작
    expect(findActive(items, 2.5)).toBe(-1) // 1번 끝, 공백
  })

  it('어떤 구간에도 없으면 -1', () => {
    expect(findActive(items, 2.7)).toBe(-1) // 공백 구간
    expect(findActive(items, 5)).toBe(-1) // 범위 밖
    expect(findActive([], 1)).toBe(-1) // 빈 배열
  })
})

describe('seekElement', () => {
  it('탐색 가능한 상태면 즉시 currentTime을 설정한다', () => {
    const el = fakeMedia({ readyState: 1, seekableLength: 1 })
    seekElement(el, 3)
    expect(el.currentTime).toBe(3)
  })

  it('준비 전(seekable 비어있음)이면 즉시 설정하지 않고 0으로 남는다', () => {
    const el = fakeMedia({ readyState: 0, seekableLength: 0 })
    seekElement(el, 3)
    // 지금 할당하면 0으로 클램프되므로 적용을 미룬다.
    expect(el.currentTime).toBe(0)
  })

  it('준비되면(canplay) 미뤘던 탐색을 적용하고 리스너를 정리한다', () => {
    const el = fakeMedia({ readyState: 0, seekableLength: 0 })
    seekElement(el, 3)
    expect(el.currentTime).toBe(0)

    // 데이터가 준비되어 seekable이 채워진 뒤 canplay 발화
    el.readyState = 3
    el.seekable.length = 1
    el.fire('canplay')

    expect(el.currentTime).toBe(3)
    // 한 번 적용 후 모든 준비 리스너가 제거되어야 한다.
    expect(el.listeners.loadedmetadata?.size ?? 0).toBe(0)
    expect(el.listeners.canplay?.size ?? 0).toBe(0)
    expect(el.listeners.canplaythrough?.size ?? 0).toBe(0)
  })

  it('readyState만 충분하고 seekable이 비면 여전히 미룬다', () => {
    const el = fakeMedia({ readyState: 4, seekableLength: 0 })
    seekElement(el, 5)
    expect(el.currentTime).toBe(0)
    el.seekable.length = 1
    el.fire('loadedmetadata')
    expect(el.currentTime).toBe(5)
  })
})
