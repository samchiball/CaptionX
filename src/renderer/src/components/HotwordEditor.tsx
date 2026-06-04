import { useState } from 'react'
import type { HotwordsApi } from '../hooks/useHotwords'
import { useTranslation } from '../i18n'
import { InfoTooltip } from './InfoTooltip'

type HotwordEditorProps = {
  api: HotwordsApi
  disabled?: boolean
}

/**
 * 핫워드 단어장 편집기. 고유명사·전문용어를 등록하면 전사 시 Whisper
 * initial_prompt로 주입돼 해당 단어의 인식 정확도를 높인다.
 * 단어는 칩으로 표시하고, 입력창에 쉼표/줄바꿈을 섞어 여러 개를 한 번에 넣을 수 있다.
 */
export function HotwordEditor({ api, disabled = false }: HotwordEditorProps): React.JSX.Element {
  const { hotwords, add, remove, clear, replaceFromText } = api
  const [draft, setDraft] = useState('')
  const t = useTranslation()

  const commit = (): void => {
    const text = draft.trim()
    if (!text) return
    // 쉼표/줄바꿈이 섞여 있으면 여러 단어로 분해해 추가한다.
    if (/[,\n]/.test(text)) {
      replaceFromText([...hotwords, ...text.split(/[,\n]/)].join('\n'))
    } else {
      add(text)
    }
    setDraft('')
  }

  // 단어장을 한 줄에 하나씩 담은 txt 파일로 내려받는다.
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
