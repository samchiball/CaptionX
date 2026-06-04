import type { ExportFormat, ExportOptions } from '@shared/types'
import { useState } from 'react'
import { useTranslation } from '../i18n'

interface Props {
  disabled: boolean
  onExport: (options: ExportOptions) => Promise<string | null>
}

const FORMATS: ExportFormat[] = ['srt', 'vtt', 'json']

export function ExportBar({ disabled, onExport }: Props): React.JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('srt')
  const [includeWords, setIncludeWords] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)
  const t = useTranslation()

  const handleExport = async (): Promise<void> => {
    const path = await onExport({ format, includeWords })
    if (path) setSaved(path)
  }

  return (
    <div className="exportbar">
      <label className="exportbar__field">
        {t('export.format')}
        <select
          value={format}
          onChange={(e) => setFormat(e.target.value as ExportFormat)}
          disabled={disabled}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f.toUpperCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="exportbar__check">
        <input
          type="checkbox"
          checked={includeWords}
          onChange={(e) => setIncludeWords(e.target.checked)}
          disabled={disabled || format === 'srt'}
        />
        {t('export.includeWords')}
      </label>
      <button type="button" onClick={handleExport} disabled={disabled}>
        {t('export.run')}
      </button>
      {saved && <span className="exportbar__saved">{t('export.saved', { path: saved })}</span>}
    </div>
  )
}
