import type { DataPathKey, DataPaths, ModelDownloadProgress, ModelEntry } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api'
import {
  MAX_CONCURRENCY,
  MAX_THREADS,
  MIN_CONCURRENCY,
  MIN_THREADS,
  normalizeConcurrency,
  normalizeThreads
} from '../hooks/useBatch'
import { useClickOutside } from '../hooks/useClickOutside'
import type { UiThemePreference } from '../hooks/useTheme'
import type { UpdaterApi } from '../hooks/useUpdater'
import { useTranslation } from '../i18n'
import { CloseIcon } from './DoodleIcons'
import { InfoTooltip } from './InfoTooltip'

type SettingsModalProps = {
  open: boolean
  onClose: () => void
  concurrency: number
  onConcurrencyChange: React.Dispatch<React.SetStateAction<number>>
  threads: number
  onThreadsChange: React.Dispatch<React.SetStateAction<number>>
  /** Recommended max concurrency (based on resource estimation). Highlighted with a warning color if exceeded. */
  maxRecommendedConcurrency: number
  /** Whether hardware info has been fetched (controls visibility of recommendation max concurrency). */
  hasHardware: boolean
  uiTheme: UiThemePreference
  onUiThemeChange: (next: UiThemePreference) => void
  /** Auto updater status/actions (manual check, download, install). */
  updater: UpdaterApi
}

/**
 * System settings modal opened via Ctrl+,. Groups transcription performance settings.
 *  - Concurrency: file-level concurrency to process multiple files in the queue.
 *  - Whisper threads (n_threads): number of whisper.cpp CPU threads used for a single transcription job.
 */
export function SettingsModal({
  open,
  onClose,
  concurrency,
  onConcurrencyChange,
  threads,
  onThreadsChange,
  maxRecommendedConcurrency,
  hasHardware,
  uiTheme,
  onUiThemeChange,
  updater
}: SettingsModalProps): React.JSX.Element | null {
  const t = useTranslation()
  const dialogRef = useRef<HTMLDivElement>(null)
  useClickOutside(dialogRef, onClose)

  const [version, setVersion] = useState<string>('')
  const [dataPaths, setDataPaths] = useState<DataPaths | null>(null)
  const [models, setModels] = useState<ModelEntry[]>([])
  const [dlStates, setDlStates] = useState<
    Record<string, { pct: number; error: string | null }>
  >({})

  // Fetch app version when the modal opens.
  useEffect(() => {
    if (!open) return
    api
      .getVersion()
      .then((v) => setVersion(v))
      .catch((err) => {
        console.error('[SettingsModal] Failed to get app version:', err)
      })
  }, [open])

  // Fetch data storage paths when the modal opens.
  useEffect(() => {
    if (!open) return
    api
      .getDataPaths()
      .then((p) => setDataPaths(p))
      .catch((err) => {
        console.error('[SettingsModal] Failed to get data paths:', err)
      })
  }, [open])

  // Open the specified data storage folder in file explorer.
  const openDataPath = (key: DataPathKey): void => {
    api.openDataPath(key).catch((err) => {
      console.error('[SettingsModal] Failed to open data path:', err)
    })
  }

  // Fetch models list when the modal opens.
  useEffect(() => {
    if (!open) return
    api.listModels().then(setModels).catch(() => {})
  }, [open])

  // Subscribe to model download progress events while the modal is open.
  useEffect(() => {
    if (!open) return
    const unsub = api.onModelProgress((p: ModelDownloadProgress) => {
      if (p.done) {
        setDlStates((prev) => {
          const next = { ...prev }
          delete next[p.name]
          return next
        })
        // Refresh the models list after download completes
        api.listModels().then(setModels).catch(() => {})
      } else if (p.error) {
        setDlStates((prev) => ({ ...prev, [p.name]: { pct: 0, error: p.error ?? null } }))
      } else {
        const pct = p.total > 0 ? Math.round((p.downloaded / p.total) * 100) : 0
        setDlStates((prev) => ({ ...prev, [p.name]: { pct, error: null } }))
      }
    })
    return unsub
  }, [open])

  const handleDownload = useCallback((fileName: string) => {
    setDlStates((prev) => ({ ...prev, [fileName]: { pct: 0, error: null } }))
    api.downloadModel(fileName).catch(() => {})
  }, [])

  const handleCancelDownload = useCallback((fileName: string) => {
    api.cancelDownload(fileName).catch(() => {})
  }, [])

  const handleDelete = useCallback((fileName: string) => {
    api.deleteModel(fileName).then(() => api.listModels()).then(setModels).catch(() => {})
  }, [])

  // Close on ESC.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const overConcurrency = hasHardware && concurrency > maxRecommendedConcurrency

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        ref={dialogRef}
      >
        <header className="modal__header">
          <h2 className="modal__title">{t('settings.title')}</h2>
          <button
            type="button"
            className="modal__close"
            aria-label={t('settings.close')}
            onClick={onClose}
          >
            <CloseIcon uiTheme={uiTheme} />
          </button>
        </header>

        <section className="modal__section">
          <h3 className="modal__section-title">{t('settings.transcription')}</h3>

          <label className="modal__field">
            <span className="modal__field-label">
              {t('settings.concurrency')}
              <InfoTooltip text={t('tooltip.concurrency')} uiTheme={uiTheme} />
            </span>
            <div className="modal__field-input">
              <input
                type="number"
                min={MIN_CONCURRENCY}
                max={MAX_CONCURRENCY}
                step={1}
                value={concurrency}
                onChange={(e) =>
                  onConcurrencyChange(
                    Number.isFinite(e.target.valueAsNumber)
                      ? e.target.valueAsNumber
                      : MIN_CONCURRENCY
                  )
                }
                onBlur={() => onConcurrencyChange((v) => normalizeConcurrency(v))}
              />
              {hasHardware && (
                <span
                  className="modal__hint"
                  style={{ color: overConcurrency ? 'var(--danger)' : 'var(--accent)' }}
                >
                  {t('controls.recommendedMax', { n: maxRecommendedConcurrency })}
                </span>
              )}
            </div>
          </label>

          <label className="modal__field">
            <span className="modal__field-label">
              {t('settings.threads')}
              <InfoTooltip text={t('tooltip.threads')} uiTheme={uiTheme} />
            </span>
            <div className="modal__field-input">
              <input
                type="number"
                min={MIN_THREADS}
                max={MAX_THREADS}
                step={1}
                value={threads}
                onChange={(e) =>
                  onThreadsChange(
                    Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : MIN_THREADS
                  )
                }
                onBlur={() => onThreadsChange((v) => normalizeThreads(v))}
              />
              <span className="modal__hint">{t('settings.threadsAuto')}</span>
            </div>
          </label>

          <label className="modal__field">
            <span className="modal__field-label">{t('settings.uiTheme')}</span>
            <div className="modal__field-input">
              <select
                value={uiTheme}
                onChange={(e) => onUiThemeChange(e.target.value as UiThemePreference)}
              >
                <option value="default">{t('settings.uiTheme.default')}</option>
                <option value="doodle">{t('settings.uiTheme.doodle')}</option>
              </select>
            </div>
          </label>

          <div className="modal__separator" />

          {/* Model Management */}
          <div className="modal__models">
            <div className="modal__models-header">
              <h3 className="modal__section-title">{t('settings.models')}</h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => api.openModelsDir().catch(() => {})}
              >
                {t('settings.models.openFolder')}
              </button>
            </div>
            <div className="modal__model-list">
              {models.map((m) => {
                const dl = dlStates[m.fileName]
                const isDownloading = dl !== undefined && dl.error === null
                return (
                  <div key={m.fileName} className="modal__model-row">
                    <div className="modal__model-info">
                      <span className="modal__model-name">{m.name}</span>
                      {m.present && m.sizeBytes > 0 && (
                        <span className="modal__model-size">
                          {(m.sizeBytes / 1024 / 1024).toFixed(0)} MB
                        </span>
                      )}
                      {dl?.error && (
                        <span className="modal__model-error">{t('settings.models.error')}</span>
                      )}
                    </div>
                    <div className="modal__model-action">
                      {isDownloading ? (
                        <>
                          <span className="modal__model-pct">
                            {t('settings.models.downloading', { pct: dl.pct })}
                          </span>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => handleCancelDownload(m.fileName)}
                          >
                            {t('settings.models.cancel')}
                          </button>
                        </>
                      ) : m.present ? (
                        <>
                          <span className="modal__model-badge">{t('settings.models.installed')}</span>
                          <button
                            type="button"
                            className="btn-ghost btn-ghost--danger"
                            onClick={() => handleDelete(m.fileName)}
                          >
                            {t('settings.models.delete')}
                          </button>
                        </>
                      ) : m.downloadable ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => handleDownload(m.fileName)}
                        >
                          {t('settings.models.download')}
                        </button>
                      ) : (
                        <span className="modal__model-manual">{t('settings.models.notDownloadable')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="modal__separator" />

          <div className="modal__data-storage">
            <h3 className="modal__section-title">{t('settings.dataStorage')}</h3>
            <p className="modal__data-storage-desc">{t('settings.dataStorage.desc')}</p>
            {(
              [
                ['history', t('settings.dataStorage.history')],
                ['audioCache', t('settings.dataStorage.audioCache')]
              ] as Array<[DataPathKey, string]>
            ).map(([key, label]) => (
              <div className="modal__data-row" key={key}>
                <div className="modal__data-info">
                  <span className="modal__data-label">{label}</span>
                  <code className="modal__data-path" title={dataPaths?.[key] ?? ''}>
                    {dataPaths?.[key] ?? '…'}
                  </code>
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => openDataPath(key)}
                  disabled={!dataPaths}
                >
                  {t('settings.dataStorage.open')}
                </button>
              </div>
            ))}
          </div>

          <div className="modal__separator" />

          <div className="modal__app-info">
            <h3 className="modal__section-title">{t('settings.appInfo')}</h3>
            <div className="modal__version-line">
              <span className="modal__version-name">CaptionX</span>
              <span className="modal__app-version-badge">v{version || '0.1.0'}</span>
            </div>

            <div className="modal__update-row">
              <span className="modal__update-status">
                {updater.status.phase === 'checking' && t('update.checking')}
                {updater.status.phase === 'not-available' && t('update.upToDate')}
                {updater.status.phase === 'available' &&
                  t('update.available', { version: updater.status.version ?? '' })}
                {updater.status.phase === 'downloading' &&
                  t('update.downloading', { pct: updater.status.percent ?? 0 })}
                {updater.status.phase === 'downloaded' && t('update.downloaded')}
                {updater.status.phase === 'error' && t('update.error')}
              </span>
              {updater.status.phase === 'available' ? (
                updater.manualInstall ? (
                  <button type="button" className="btn-ghost" onClick={updater.openReleasePage}>
                    {t('update.openPage')}
                  </button>
                ) : (
                  <button type="button" className="btn-ghost" onClick={updater.download}>
                    {t('update.download')}
                  </button>
                )
              ) : updater.status.phase === 'downloaded' ? (
                <button type="button" className="btn-ghost" onClick={updater.install}>
                  {t('update.restart')}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={updater.check}
                  disabled={
                    updater.status.phase === 'checking' || updater.status.phase === 'downloading'
                  }
                >
                  {t('update.check')}
                </button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
