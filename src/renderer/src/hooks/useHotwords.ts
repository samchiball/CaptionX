import { useCallback } from 'react'
import { usePersistentState } from './usePersistentState'

/** 트림한 단어를 목록 끝에 추가한다(이미 있으면 그대로). 순수 함수. */
export function addHotword(list: string[], term: string): string[] {
  const trimmed = term.trim()
  if (!trimmed || list.includes(trimmed)) return list
  return [...list, trimmed]
}

/** 쉼표·줄바꿈으로 구분된 텍스트를 단어 배열로 파싱한다(트림·중복 제거). 순수 함수. */
export function parseHotwordText(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/[,\n]/)) {
    const term = raw.trim()
    if (term && !out.includes(term)) out.push(term)
  }
  return out
}

export interface HotwordsApi {
  hotwords: string[]
  add: (term: string) => void
  remove: (term: string) => void
  clear: () => void
  /** 쉼표·줄바꿈 구분 텍스트로 일괄 교체(붙여넣기 입력용) */
  replaceFromText: (text: string) => void
}

/**
 * 핫워드 단어장 상태를 관리하고 localStorage에 영속화한다.
 * 등록한 단어는 전사 시 Whisper initial_prompt로 주입돼 인식 정확도를 보정한다.
 */
export function useHotwords(): HotwordsApi {
  const [hotwords, setHotwords] = usePersistentState<string[]>('hotwords', [])

  const add = useCallback(
    (term: string): void => {
      setHotwords((prev) => addHotword(prev, term))
    },
    [setHotwords]
  )

  const remove = useCallback(
    (term: string): void => {
      setHotwords((prev) => prev.filter((t) => t !== term))
    },
    [setHotwords]
  )

  const clear = useCallback((): void => setHotwords([]), [setHotwords])

  const replaceFromText = useCallback(
    (text: string): void => {
      setHotwords(parseHotwordText(text))
    },
    [setHotwords]
  )

  return { hotwords, add, remove, clear, replaceFromText }
}
