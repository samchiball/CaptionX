import { isMediaPath } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import { useTranslation } from '../i18n'

interface Props {
  disabled: boolean
  onAdd: (paths: string[]) => void
}

export function DropZone({ disabled, onAdd }: Props): React.JSX.Element {
  const [hover, setHover] = useState(false)
  const t = useTranslation()

  // Capture the latest values with refs — prevents stale closures within the Tauri event listener
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const onAddRef = useRef(onAdd)
  onAddRef.current = onAdd

  // Subscribe to Tauri file drop event (uses Tauri DragDropEvent instead of getPathForFile)
  useEffect(() => {
    return api.onFileDrop((paths) => {
      setHover(false)
      if (disabledRef.current) return
      const valid = paths.filter(isMediaPath)
      if (valid.length > 0) onAddRef.current(valid)
    })
  }, [])

  const pick = useCallback(async (): Promise<void> => {
    if (disabled) return
    const paths = await api.selectFiles()
    if (paths.length > 0) onAdd(paths)
  }, [disabled, onAdd])

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
      onDrop={(e) => e.preventDefault()}
    >
      <span className="dropzone__icon" aria-hidden>
        🎬
      </span>
      <span className="dropzone__title">{t('dropzone.title')}</span>
      <span className="dropzone__hint">{t('dropzone.hint')}</span>
    </button>
  )
}
