import { useEffect } from 'react'
import { usePersistentState } from './usePersistentState'

export type ThemePreference = 'light' | 'dark' | 'system'
export type UiThemePreference = 'default' | 'doodle'
type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === 'system') {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
  }
  return pref
}

interface ThemeApi {
  preference: ThemePreference
  setPreference: React.Dispatch<React.SetStateAction<ThemePreference>>
  /** system 선호를 OS 설정으로 해석한 실제 테마 */
  resolved: ResolvedTheme
  uiTheme: UiThemePreference
  setUiTheme: React.Dispatch<React.SetStateAction<UiThemePreference>>
}

/**
 * 테마 선호도를 localStorage 에 저장하고 document 루트의 data-theme 속성에 반영한다.
 * 'system' 이면 OS 다크모드 설정을 따라가고 변경도 실시간 반영한다.
 * UI 스타일 테마(uiTheme)도 localStorage 에 저장하고 data-ui-theme 속성에 반영한다.
 */
export function useTheme(): ThemeApi {
  const [preference, setPreference] = usePersistentState<ThemePreference>('theme', 'system')
  const [uiTheme, setUiTheme] = usePersistentState<UiThemePreference>('uiTheme', 'default')

  useEffect(() => {
    const apply = (): void => {
      document.documentElement.dataset.theme = resolve(preference)
    }
    apply()

    if (preference !== 'system') return
    const mql = window.matchMedia(DARK_QUERY)
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [preference])

  useEffect(() => {
    document.documentElement.dataset.uiTheme = uiTheme
  }, [uiTheme])

  return {
    preference,
    setPreference,
    resolved: resolve(preference),
    uiTheme,
    setUiTheme
  }
}
