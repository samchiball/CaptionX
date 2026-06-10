import { useState } from 'react'
import type { HotwordsApi } from '../hooks/useHotwords'
import { useTranslation } from '../i18n'
import { InfoTooltip } from './InfoTooltip'

type HotwordEditorProps = {
  api: HotwordsApi
  disabled?: boolean
}

/**
 * Hotword editor. Registering proper nouns or technical terms injects them
 * into Whisper's initial_prompt during transcription to increase recognition accuracy.
 * Words are displayed as chips, and multiple words can be added at once separated by commas or newlines.
 */
export function HotwordEditor({ api, disabled = false }: HotwordEditorProps): React.JSX.Element {
  const { hotwords, add, remove, clear, replaceFromText } = api
  const [draft, setDraft] = useState('')
  const t = useTranslation()

  const commit = (): void => {
    const text = draft.trim()
    if (!text) return
    // If commas or newlines are mixed, split into multiple words and add them.
    if (/[,\n]/.test(text)) {
      replaceFromText([...hotwords, ...text.split(/[,\n]/)].join('\n'))
    } else {
      add(text)
    }
    setDraft('')
  }

  // Download the hotwords list as a txt file, one word per line.
  const download = (): void => {
    const blob = new Blob([`${hotwords.join('\n')}\n`], {
      type: 'text/plain;charset=utf-8'
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'hotwords.txt'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="hotwords">
      <div className="hotwords__head">
        <span className="hotwords__title">{t('hotwords.title')}</span>
        <InfoTooltip text={t('hotwords.tooltip')} />
        <span className="hotwords__hint">{t('hotwords.hint', { n: hotwords.length })}</span>
        {hotwords.length > 0 && (
          <>
            <button
              type="button"
              className="btn-ghost hotwords__download"
              onClick={download}
              disabled={disabled}
            >
              {t('hotwords.exportTxt')}
            </button>
            <button
              type="button"
              className="btn-ghost hotwords__clear"
              onClick={clear}
              disabled={disabled}
            >
              {t('hotwords.clear')}
            </button>
          </>
        )}
      </div>

      <div className="hotwords__input-row">
        <input
          type="text"
          className="hotwords__input"
          placeholder={t('hotwords.placeholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
          disabled={disabled}
        />
        <button
          type="button"
          className="btn-ghost"
          onClick={commit}
          disabled={disabled || draft.trim() === ''}
        >
          {t('hotwords.add')}
        </button>
      </div>

      {hotwords.length > 0 && (
        <ul className="hotwords__chips">
          {hotwords.map((term) => (
            <li key={term} className="hotwords__chip">
              <span>{term}</span>
              <button
                type="button"
                className="hotwords__chip-remove"
                aria-label={t('hotwords.removeAria', { term })}
                onClick={() => remove(term)}
                disabled={disabled}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
