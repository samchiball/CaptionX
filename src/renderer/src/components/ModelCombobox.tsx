import { useId, useRef, useState } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'
import { useTranslation } from '../i18n'

export interface BaseModelOption {
  value: string
  label: string
  sizeStandard: string
  sizeQuantized: string
  memoryStandard: string
  memoryQuantized: string
}

export const BASE_MODEL_OPTIONS: BaseModelOption[] = [
  {
    value: 'tiny',
    label: 'tiny',
    sizeStandard: '75 MB',
    sizeQuantized: '50 MB',
    memoryStandard: 'RAM 150MB / VRAM 200MB',
    memoryQuantized: 'RAM 100MB / VRAM 120MB'
  },
  {
    value: 'base',
    label: 'base',
    sizeStandard: '145 MB',
    sizeQuantized: '95 MB',
    memoryStandard: 'RAM 250MB / VRAM 300MB',
    memoryQuantized: 'RAM 180MB / VRAM 200MB'
  },
  {
    value: 'small',
    label: 'small',
    sizeStandard: '460 MB',
    sizeQuantized: '280 MB',
    memoryStandard: 'RAM 900MB / VRAM 1.0GB',
    memoryQuantized: 'RAM 500MB / VRAM 600MB'
  },
  {
    value: 'medium',
    label: 'medium',
    sizeStandard: '1.5 GB',
    sizeQuantized: '540 MB',
    memoryStandard: 'RAM 3.0GB / VRAM 3.5GB',
    memoryQuantized: 'RAM 1.1GB / VRAM 1.3GB'
  },
  {
    value: 'large-v3-turbo',
    label: 'large-v3-turbo',
    sizeStandard: '1.6 GB',
    sizeQuantized: '560 MB',
    memoryStandard: 'RAM 3.2GB / VRAM 3.7GB',
    memoryQuantized: 'RAM 1.2GB / VRAM 1.4GB'
  },
  {
    value: 'large-v3',
    label: 'large-v3',
    sizeStandard: '3.1 GB',
    sizeQuantized: '1.1 GB',
    memoryStandard: 'RAM 6.0GB / VRAM 6.5GB',
    memoryQuantized: 'RAM 2.0GB / VRAM 2.3GB'
  }
]

interface ModelBaseComboboxProps {
  value: string
  isQuantized: boolean
  disabled?: boolean
  onChange: (value: string) => void
}

export function ModelBaseCombobox({
  value,
  isQuantized,
  disabled = false,
  onChange
}: ModelBaseComboboxProps): React.JSX.Element {
  const inputId = useId()
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useClickOutside(containerRef, () => setOpen(false))

  const selectedOption = BASE_MODEL_OPTIONS.find((o) => o.value === value)

  return (
    <div className="combobox" ref={containerRef}>
      <input
        id={inputId}
        className="combobox__input"
        type="search"
        role="combobox"
        aria-autocomplete="none"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        readOnly
        value={
          selectedOption
            ? `${selectedOption.label} (${isQuantized ? selectedOption.sizeQuantized : selectedOption.sizeStandard})`
            : value
        }
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        style={{ cursor: 'pointer' }}
      />
      {open && !disabled && (
        <div id={listboxId} className="combobox__list" role="listbox" aria-labelledby={inputId}>
          {BASE_MODEL_OPTIONS.map((option) => (
            <button
              type="button"
              className="combobox__option"
              key={option.value}
              role="option"
              aria-selected={value === option.value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
            >
              <span>{option.label}</span>
              <span>
                {isQuantized ? option.sizeQuantized : option.sizeStandard} ·{' '}
                {isQuantized ? option.memoryQuantized : option.memoryStandard}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface QuantizationComboboxProps {
  value: 'fp16' | 'q5'
  disabled?: boolean
  onChange: (value: 'fp16' | 'q5') => void
}

export function QuantizationCombobox({
  value,
  disabled = false,
  onChange
}: QuantizationComboboxProps): React.JSX.Element {
  const inputId = useId()
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const t = useTranslation()

  useClickOutside(containerRef, () => setOpen(false))

  return (
    <div className="combobox" ref={containerRef}>
      <input
        id={inputId}
        className="combobox__input"
        type="search"
        role="combobox"
        aria-autocomplete="none"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        readOnly
        value={value === 'q5' ? t('quant.q5') : t('quant.fp16')}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
        style={{ cursor: 'pointer' }}
      />
      {open && !disabled && (
        <div id={listboxId} className="combobox__list" role="listbox" aria-labelledby={inputId}>
          <button
            type="button"
            className="combobox__option"
            role="option"
            aria-selected={value === 'fp16'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('fp16')
              setOpen(false)
            }}
          >
            <span>{t('quant.fp16')}</span>
            <span>{t('quant.fp16Desc')}</span>
          </button>
          <button
            type="button"
            className="combobox__option"
            role="option"
            aria-selected={value === 'q5'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('q5')
              setOpen(false)
            }}
          >
            <span>{t('quant.q5')}</span>
            <span>{t('quant.q5Desc')}</span>
          </button>
        </div>
      )}
    </div>
  )
}
