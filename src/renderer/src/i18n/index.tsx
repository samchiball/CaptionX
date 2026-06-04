import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { usePersistentState } from '../hooks/usePersistentState'
import { interpolate, type TParams } from './format'
import { type MessageKey, translations, UI_LOCALES, type UiLocale } from './translations'

export type { UiLocale } from './translations'
export { UI_LOCALE_LABELS, UI_LOCALES } from './translations'

export type TranslateFn = (key: MessageKey, params?: TParams) => string

interface LocaleApi {
  locale: UiLocale
  setLocale: (next: UiLocale) => void
  t: TranslateFn
}

const LocaleContext = createContext<LocaleApi | null>(null)

/** OS/브라우저 언어에서 지원 UI 언어를 추정한다(미지원이면 ko). */
function detectDefaultLocale(): UiLocale {
  const candidates = [navigator.language, ...(navigator.languages ?? [])]
  for (const tag of candidates) {
    const lower = tag.toLowerCase()
    // 중국어는 간체/번체를 명확히 구분한다.
    // 번체: zh-Hant, zh-TW, zh-HK, zh-MO / 그 외 zh* 는 간체로 본다.
    if (/^zh\b/.test(lower)) {
      return /(hant|tw|hk|mo)/.test(lower) ? 'zh-Hant' : 'zh-Hans'
    }
    const base = lower.split('-')[0]
    const match = UI_LOCALES.find((l) => l.toLowerCase() === base)
    if (match) return match
  }
  return 'ko'
}

export function LocaleProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [locale, setLocale] = usePersistentState<UiLocale>('locale', detectDefaultLocale())

  // 문서 루트 lang 속성을 동기화해 접근성·폰트 힌트를 정확히 한다.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback<TranslateFn>(
    (key, params) => {
      const dict = translations[locale] ?? translations.ko
      return interpolate(dict[key] ?? translations.ko[key] ?? key, params)
    },
    [locale]
  )

  const value = useMemo<LocaleApi>(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/** 현재 UI 언어와 번역 함수 t 를 제공한다. */
export function useLocale(): LocaleApi {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}

/** 번역 함수만 필요할 때 쓰는 단축 훅. */
export function useTranslation(): TranslateFn {
  return useLocale().t
}
