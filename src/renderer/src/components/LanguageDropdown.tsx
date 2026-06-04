import { useId, useRef, useState } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import { useTranslation } from '../i18n'
import { AUTO_LANGUAGE_CODE, findLanguageOption, LANGUAGE_OPTIONS } from '../languages'

type LanguageDropdownProps = {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}

export function LanguageDropdown({
  value,
  disabled = false,
  onChange
}: LanguageDropdownProps): React.JSX.Element {
  const buttonId = useId()
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const t = useTranslation()

  useClickOutside(containerRef, () => setOpen(false))

  const selected = findLanguageOption(value)
  const isAuto = value === AUTO_LANGUAGE_CODE
  const triggerLabel = isAuto ? t('language.auto') : selected ? selected.korean : value

  const selectLanguage = (nextValue: string): void => {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className="dropdown" ref={containerRef}>
      <button
        id={buttonId}
        type="button"
        className="dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{triggerLabel}</span>
        <span className="dropdown__caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && !disabled && (
        <div id={listboxId} className="dropdown__list" role="listbox" aria-labelledby={buttonId}>
          <button
            type="button"
            className="dropdown__option"
            role="option"
            aria-selected={isAuto}
            onClick={() => selectLanguage(AUTO_LANGUAGE_CODE)}
          >
            <span>{t('language.auto')}</span>
            <span>auto</span>
          </button>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              type="button"
              className="dropdown__option"
              key={option.code}
              role="option"
              aria-selected={value === option.code}
              onClick={() => selectLanguage(option.code)}
            >
              <span>{option.korean}</span>
              <span>
                {option.english} · {option.code}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
