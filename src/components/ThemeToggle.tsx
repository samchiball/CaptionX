import type { ThemePreference, UiThemePreference } from '../hooks/useTheme'
import { useTranslation } from '../i18n'
import { MoonIcon, SunIcon, SystemIcon } from './DoodleIcons'

interface Props {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  onChange: (next: ThemePreference) => void
  uiTheme: UiThemePreference
}

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light'
}

/**
 * 라이트 → 다크 → 시스템 순으로 순환하는 테마 토글.
 * 아이콘은 현재 선호를, 시스템일 때는 실제 적용된 테마를 함께 보여준다.
 */
export function ThemeToggle({ preference, resolved, onChange, uiTheme }: Props): React.JSX.Element {
  const t = useTranslation()
  const text = t(`theme.${preference}`)
  const hint =
    preference === 'system' ? ` · ${resolved === 'dark' ? t('theme.dark') : t('theme.light')}` : ''

  const renderIcon = (): React.JSX.Element => {
    switch (preference) {
      case 'light':
        return <SunIcon uiTheme={uiTheme} />
      case 'dark':
        return <MoonIcon uiTheme={uiTheme} />
      case 'system':
        return <SystemIcon uiTheme={uiTheme} />
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => onChange(NEXT[preference])}
      title={t('theme.toggleTitle')}
      aria-label={t('theme.ariaLabel', { label: `${text}${hint}` })}
    >
      <span className="theme-toggle__icon">{renderIcon()}</span>
      <span className="theme-toggle__text">
        {text}
        {hint}
      </span>
    </button>
  )
}
