/** 사용자가 작업을 취소했을 때 던지는 에러. 일반 오류와 구분해 처리한다. */
export class CancellationError extends Error {
  constructor() {
    super('작업이 취소되었습니다.')
    this.name = 'CancellationError'
  }
}

/** 취소 에러인지 판별한다(메시지/이름 기반, 프로세스 경계에서도 동작). */
export function isCancellation(err: unknown): boolean {
  return (
    err instanceof CancellationError ||
    (err instanceof Error && err.name === 'CancellationError') ||
    (typeof (err as { message?: unknown })?.message === 'string' &&
      (err as Error).message.includes('작업이 취소되었습니다'))
  )
}

/** 중단 신호가 켜졌으면 CancellationError를 던진다(파이프라인 체크포인트용). */
export function throwIfCanceled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancellationError()
}

/**
 * 네이티브/오래 걸리는 Promise를 중단 신호와 경쟁시킨다.
 * abort 시 즉시 CancellationError로 reject 되어 UI가 멈추지 않고 메모리를 빠르게 회수할 수 있다.
 * 원본 작업(예: whisper 네이티브 호출)은 중단 API가 없으면 백그라운드에서 끝나지만,
 * 결과 참조를 버리므로 JS 힙은 즉시 해제된다.
 */
export function raceCancellation<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(new CancellationError())
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(new CancellationError())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      }
    )
  })
}
