import { useRef, useState } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import type { UiThemePreference } from '../hooks/useTheme'
import { UI_LOCALE_LABELS, UI_LOCALES, useLocale } from '../i18n'
import { GlobeIcon } from './DoodleIcons'

interface Props {
  uiTheme: UiThemePreference
}

/**
 * 표시 언어를 전환하는 토글. 지원 UI 언어를 목록으로 띄우고,
 * 선택은 localStorage 에 저장돼 다음 실행에도 유지된다.
 */
export function LocaleToggle({ uiTheme }: Props): React.JSX.Element {
  const { locale, setLocale, t } = useLocale()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false))

  return (
    <div className="dropdown locale-toggle" ref={containerRef}>
      <button
        type="button"
        className="theme-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('locale.ariaLabel')}
        title={t('locale.label')}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="theme-toggle__icon" aria-hidden="true">
          <GlobeIcon uiTheme={uiTheme} />
        </span>
        <span className="theme-toggle__text">{UI_LOCALE_LABELS[locale]}</span>
      </button>
      {open && (
        <div className="dropdown__list" role="listbox" aria-label={t('locale.label')}>
          {UI_LOCALES.map((code) => (
            <button
              type="button"
              className="dropdown__option"
              key={code}
              role="option"
              aria-selected={locale === code}
              onClick={() => {
                setLocale(code)
                setOpen(false)
              }}
            >
              <span>{UI_LOCALE_LABELS[code]}</span>
              <span>{code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
