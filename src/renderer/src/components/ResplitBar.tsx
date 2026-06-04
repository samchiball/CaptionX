import type { ResplitOptions } from '@shared/types'
import { useState } from 'react'
import { useTranslation } from '../i18n'

interface Props {
  disabled: boolean
  onResplit: (options: ResplitOptions) => Promise<void>
}

const DEFAULT_MAX_CHARS = 16

/**
 * 전사 완료 후 자막을 문맥 기준으로 다시 나누는 컨트롤.
 * maxChars 는 한 줄의 권장 길이이며 실제 분할은 침묵·문장부호·조사/어미 흐름에 맞춘다.
 */
export function ResplitBar({ disabled, onResplit }: Props): React.JSX.Element {
  const [maxChars, setMaxChars] = useState(DEFAULT_MAX_CHARS)
  const [busy, setBusy] = useState(false)
  const t = useTranslation()

  const handleResplit = async (): Promise<void> => {
    setBusy(true)
    try {
      await onResplit({ maxChars })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="resplitbar">
      <label className="resplitbar__field">
        {t('resplit.maxChars')}
        <input
          type="number"
          min={1}
          max={100}
          value={maxChars}
          onChange={(e) => setMaxChars(Math.max(1, Number(e.target.value) || 1))}
          disabled={disabled || busy}
        />
      </label>
      <button type="button" onClick={handleResplit} disabled={disabled || busy}>
        {busy ? t('resplit.running') : t('resplit.run')}
      </button>
      <span className="resplitbar__hint">{t('resplit.hint')}</span>
    </div>
  )
}
