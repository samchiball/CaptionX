import { describe, expect, it } from 'vitest'
import {
  CancellationError,
  isCancellation,
  raceCancellation,
  throwIfCanceled
} from './cancellation'

describe('throwIfCanceled', () => {
  it('신호가 켜져 있으면 CancellationError를 던진다', () => {
    const ctrl = new AbortController()
    ctrl.abort()
    expect(() => throwIfCanceled(ctrl.signal)).toThrow(CancellationError)
  })

  it('신호가 없거나 꺼져 있으면 통과한다', () => {
    expect(() => throwIfCanceled(undefined)).not.toThrow()
    expect(() => throwIfCanceled(new AbortController().signal)).not.toThrow()
  })
})

describe('raceCancellation', () => {
  it('signal이 없으면 원본 Promise를 그대로 돌려준다', async () => {
    await expect(raceCancellation(Promise.resolve(42))).resolves.toBe(42)
  })

  it('이미 abort된 신호면 즉시 CancellationError로 거부한다', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(raceCancellation(new Promise(() => {}), ctrl.signal)).rejects.toBeInstanceOf(
      CancellationError
    )
  })

  it('진행 중 abort하면 원본 완료를 기다리지 않고 즉시 거부한다', async () => {
    const ctrl = new AbortController()
    const never = new Promise<number>(() => {})
    const raced = raceCancellation(never, ctrl.signal)
    ctrl.abort()
    await expect(raced).rejects.toSatisfy(isCancellation)
  })

  it('abort 전에 완료되면 정상 값을 돌려준다', async () => {
    const ctrl = new AbortController()
    await expect(raceCancellation(Promise.resolve('ok'), ctrl.signal)).resolves.toBe('ok')
  })
})
