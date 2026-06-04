import { useEffect, useRef, useState } from 'react'

const PREFIX = 'CaptionX:'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/**
 * useState 와 동일하게 동작하되, 값을 localStorage 에 저장해
 * 앱을 다시 실행해도 마지막 선택이 유지된다.
 */
export function usePersistentState<T>(
  key: string,
  fallback: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, fallback))
  const keyRef = useRef(key)
  keyRef.current = key

  useEffect(() => {
    try {
      window.localStorage.setItem(PREFIX + keyRef.current, JSON.stringify(value))
    } catch {
      // 저장 실패는 무시 (용량 초과 등)
    }
  }, [value])

  return [value, setValue]
}
