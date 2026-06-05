import type { DataPathKey, DataPaths } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
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
  /** 권장 동시 전사 수(자원 추정 기반). 초과 시 경고색으로 표시한다. */
  maxRecommendedConcurrency: number
  /** 하드웨어 정보를 가져왔는지(권장값 표시 여부). */
  hasHardware: boolean
  uiTheme: UiThemePreference
  onUiThemeChange: (next: UiThemePreference) => void
  /** 자동 업데이트 상태·액션(수동 확인·다운로드·설치). */
  updater: UpdaterApi
}

/**
 * Ctrl+, 로 여는 시스템 설정 창. 전사 성능 관련 설정을 모은다.
 *  - 동시 전사 수(concurrency): 큐의 여러 파일을 동시에 처리하는 파일 레벨 동시성.
 *  - Whisper 스레드 수(n_threads): 단일 전사 한 건이 쓰는 whisper.cpp CPU 스레드 수.
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

  // 모달이 열릴 때 버전 정보를 가져온다.
  useEffect(() => {
    if (!open) return
    window.api
      .getVersion()
      .then((v) => setVersion(v))
      .catch((err) => {
        console.error('[SettingsModal] Failed to get app version:', err)
      })
  }, [open])

  // 모달이 열릴 때 입력 데이터 저장 경로를 가져온다.
  useEffect(() => {
    if (!open) return
    window.api
      .getDataPaths()
      .then((p) => setDataPaths(p))
      .catch((err) => {
        console.error('[SettingsModal] Failed to get data paths:', err)
      })
  }, [open])

  // 지정한 데이터 저장소를 파일 탐색기에서 연다.
  const openDataPath = (key: DataPathKey): void => {
    window.api.openDataPath(key).catch((err) => {
      console.error('[SettingsModal] Failed to open data path:', err)
    })
  }

  // ESC 로 닫기.
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
