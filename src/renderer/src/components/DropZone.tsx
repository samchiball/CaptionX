import { isMediaPath } from '@shared/types'
import { useCallback, useState } from 'react'
import { useTranslation } from '../i18n'

interface Props {
  disabled: boolean
  /** 추가할 파일 경로들을 큐에 더한다 */
  onAdd: (paths: string[]) => void
}

export function DropZone({ disabled, onAdd }: Props): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const t = useTranslation()

  const pick = useCallback(async (): Promise<void> => {
    if (disabled) return
    const paths = await window.api.selectFiles()
    if (paths.length > 0) onAdd(paths)
  }, [disabled, onAdd])

  const onDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault()
      setHover(false)
      if (disabled) return
      const paths: string[] = []
      for (const file of Array.from(e.dataTransfer.files)) {
        const p = window.api.getPathForFile(file)
        if (p && isMediaPath(p)) paths.push(p)
      }
      if (paths.length > 0) onAdd(paths)
    },
    [disabled, onAdd]
  )

  return (
    <button
      type="button"
      className={`dropzone${hover ? ' dropzone--hover' : ''}${disabled ? ' dropzone--disabled' : ''}`}
      disabled={disabled}
      onClick={pick}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setHover(true)
      }}
      onDragLeave={() => setHover(false)}
      onDrop={onDrop}
    >
      <span className="dropzone__icon" aria-hidden>
        🎬
      </span>
      <span className="dropzone__title">{t('dropzone.title')}</span>
      <span className="dropzone__hint">{t('dropzone.hint')}</span>
    </button>
  )
}
