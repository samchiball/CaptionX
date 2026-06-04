import type { AlignMode } from '@shared/types'
import { useEffect, useMemo, useState } from 'react'
import logo from './assets/logo.png'
import { GearIcon } from './components/DoodleIcons'
import { DropZone } from './components/DropZone'
import { HistoryPanel } from './components/HistoryPanel'
import { HotwordEditor } from './components/HotwordEditor'
import { InfoTooltip } from './components/InfoTooltip'
import { LanguageDropdown } from './components/LanguageDropdown'
import { LocaleToggle } from './components/LocaleToggle'
import { ModelBaseCombobox, QuantizationCombobox } from './components/ModelCombobox'
import { QueueList } from './components/QueueList'
import { SettingsModal } from './components/SettingsModal'
import { ThemeToggle } from './components/ThemeToggle'
import {
  isRunnableStatus,
  normalizeConcurrency,
  normalizeThreads,
  type RunSettings,
  useBatch
} from './hooks/useBatch'
import { useHistory } from './hooks/useHistory'
import { useHotwords } from './hooks/useHotwords'
import { usePersistentState } from './hooks/usePersistentState'
import { useResourceEstimator } from './hooks/useResourceEstimator'
import { useTheme } from './hooks/useTheme'
import { useTranslation } from './i18n'

type Tab = 'transcribe' | 'history'

function App(): React.JSX.Element {
  const {
    items,
    busy,
    addPaths,
    setTrack,
    addTrackItem,
    remove,
    clearDone,
    runAll,
    cancel,
    cancelAll,
    exportItem,
    resplitItem
  } = useBatch()
  const [model, setModel] = usePersistentState('model', 'base')
  const [language, setLanguage] = usePersistentState('language', '')
  const [align, setAlign] = usePersistentState('align', true)
  const [alignMode, setAlignMode] = usePersistentState<AlignMode>('alignMode', 'wav2vec2')
  const [gpu, setGpu] = usePersistentState('gpu', true)
  const [vad, setVad] = usePersistentState('vad', false)
  const [denoise, setDenoise] = usePersistentState('denoise', false)
  // 기본값 2: 큐의 여러 파일을 동시에 전사한다(권장 한도를 넘으면 경고를 띄운다).
  const [concurrency, setConcurrency] = usePersistentState('concurrency', 2)
  // whisper.cpp 추론 스레드 수(n_threads). 0=자동(코어 수 기반 기본값).
  const [threads, setThreads] = usePersistentState('threads', 0)
  const hotwordsApi = useHotwords()
  const historyApi = useHistory()
  const [tab, setTab] = useState<Tab>('transcribe')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const theme = useTheme()
  const t = useTranslation()
  const { hardware, singleReq, totalReq, maxRecommendedConcurrency } = useResourceEstimator(
    model,
    align,
    alignMode,
    gpu,
    concurrency,
    language
  )

  const baseModel = useMemo(() => {
    return model.replace(/-q5_(0|1)$/, '')
  }, [model])

  const quantLevel = useMemo(() => {
    return model.includes('-q5_') ? 'q5' : 'fp16'
  }, [model])

  const isQuantized = quantLevel === 'q5'

  const handleBaseModelChange = (newBase: string): void => {
    if (quantLevel === 'q5') {
      const suffix =
        newBase === 'tiny' || newBase === 'base' || newBase === 'small' ? '-q5_1' : '-q5_0'
      setModel(`${newBase}${suffix}`)
    } else {
      setModel(newBase)
    }
  }

  const handleQuantLevelChange = (newQuant: 'fp16' | 'q5'): void => {
    if (newQuant === 'q5') {
      const suffix =
        baseModel === 'tiny' || baseModel === 'base' || baseModel === 'small' ? '-q5_1' : '-q5_0'
      setModel(`${baseModel}${suffix}`)
    } else {
      setModel(baseModel)
    }
  }

  // 제거된 'whisper' 정렬 모드가 localStorage에 남아 있으면 wav2vec2로 마이그레이션한다.
  useEffect(() => {
    if (alignMode !== 'wav2vec2' && alignMode !== 'mms') {
      setAlignMode('wav2vec2')
    }
  }, [alignMode, setAlignMode])

  // Ctrl+, (mac: Cmd+,) 로 시스템 설정 창을 토글한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const runnableCount = useMemo(
    () => items.filter((i) => isRunnableStatus(i.status)).length,
    [items]
  )
  const doneCount = useMemo(() => items.filter((i) => i.status === 'done').length, [items])

  const run = async (): Promise<void> => {
    const settings: RunSettings = {
      model,
      language: language.trim() || undefined,
      align,
      alignMode,
      gpu,
      vad,
      denoise,
      concurrency: normalizeConcurrency(concurrency),
      threads: normalizeThreads(threads),
      hotwords: hotwordsApi.hotwords
    }
    await runAll(settings)
  }

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <img src={logo} alt="CaptionX Logo" className="app__logo" />
          <div>
            <h1>CaptionX</h1>
          </div>
        </div>
        <div className="app__header-actions">
          <LocaleToggle uiTheme={theme.uiTheme} />
          <ThemeToggle
            preference={theme.preference}
            resolved={theme.resolved}
            onChange={theme.setPreference}
            uiTheme={theme.uiTheme}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={t('settings.open')}
            title={t('settings.open')}
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon uiTheme={theme.uiTheme} />
          </button>
        </div>
      </header>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        concurrency={concurrency}
        onConcurrencyChange={setConcurrency}
        threads={threads}
        onThreadsChange={setThreads}
        maxRecommendedConcurrency={maxRecommendedConcurrency}
        hasHardware={Boolean(hardware)}
        uiTheme={theme.uiTheme}
        onUiThemeChange={theme.setUiTheme}
      />

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'transcribe'}
          className={`tabs__tab${tab === 'transcribe' ? ' tabs__tab--active' : ''}`}
          onClick={() => setTab('transcribe')}
        >
          {t('tab.transcribe')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`tabs__tab${tab === 'history' ? ' tabs__tab--active' : ''}`}
          onClick={() => {
            setTab('history')
            void historyApi.refresh()
          }}
        >
          {t('tab.history')}
          {historyApi.entries.length > 0 ? ` (${historyApi.entries.length})` : ''}
        </button>
      </div>

      {tab === 'history' ? (
        <HistoryPanel api={historyApi} uiTheme={theme.uiTheme} />
      ) : (
        <>
          {/* 전사 중에도 새 파일을 큐에 추가할 수 있도록 항상 활성 상태로 둔다. */}
          <DropZone disabled={false} onAdd={addPaths} />

          <section className="controls">
            <label className="controls__field">
              <span className="controls__field-label">
                {t('controls.model')}
                <InfoTooltip text={t('tooltip.model')} uiTheme={theme.uiTheme} />
              </span>
              <ModelBaseCombobox
                value={baseModel}
                isQuantized={isQuantized}
                onChange={handleBaseModelChange}
                disabled={busy}
              />
            </label>
            <label className="controls__field">
              <span className="controls__field-label">
                {t('controls.quantization')}
                <InfoTooltip text={t('tooltip.quantization')} uiTheme={theme.uiTheme} />
              </span>
              <QuantizationCombobox
                value={quantLevel}
                onChange={handleQuantLevelChange}
                disabled={busy}
              />
            </label>
            <label className="controls__field">
              <span className="controls__field-label">
                {t('controls.language')}
                <InfoTooltip text={t('tooltip.language')} uiTheme={theme.uiTheme} />
              </span>
              <LanguageDropdown value={language} onChange={setLanguage} disabled={busy} />
            </label>
            <label className="controls__field">
              <span className="controls__field-label">
                {t('controls.alignMode')}
                <InfoTooltip text={t('tooltip.alignMode')} uiTheme={theme.uiTheme} />
              </span>
              <select
                value={align ? alignMode : 'none'}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'none') {
                    setAlign(false)
                  } else {
                    setAlign(true)
                    setAlignMode(v as AlignMode)
                  }
                }}
                disabled={busy}
              >
                <option value="none">{t('align.none')}</option>
                <option value="wav2vec2">{t('align.wav2vec2')}</option>
                <option value="mms">{t('align.mms')}</option>
              </select>
            </label>
            <label className="controls__check">
              <input
                type="checkbox"
                checked={gpu}
                onChange={(e) => setGpu(e.target.checked)}
                disabled={busy}
              />
              {t('controls.gpu')}
              <InfoTooltip text={t('tooltip.gpu')} uiTheme={theme.uiTheme} />
            </label>
            <label className="controls__check">
              <input
                type="checkbox"
                checked={vad}
                onChange={(e) => setVad(e.target.checked)}
                disabled={busy}
              />
              {t('controls.vad')}
              <InfoTooltip text={t('tooltip.vad')} uiTheme={theme.uiTheme} />
            </label>
            <label className="controls__check">
              <input
                type="checkbox"
                checked={denoise}
                onChange={(e) => setDenoise(e.target.checked)}
                disabled={busy}
              />
              {t('controls.denoise')}
              <InfoTooltip text={t('tooltip.denoise')} uiTheme={theme.uiTheme} />
            </label>
            <div className="controls__actions">
              {doneCount > 0 && (
                <button type="button" className="btn-ghost" onClick={clearDone} disabled={busy}>
                  {t('controls.clearDone')}
                </button>
              )}
              {busy && (
                <button type="button" className="btn-ghost btn-ghost--danger" onClick={cancelAll}>
                  {t('controls.cancelAll')}
                </button>
              )}
              <button
                type="button"
                className="controls__run"
                onClick={run}
                disabled={busy || runnableCount === 0}
              >
                {busy
                  ? t('controls.running')
                  : runnableCount > 0
                    ? t('controls.runWithCount', { n: runnableCount })
                    : t('controls.run')}
              </button>
            </div>

            <div className="hardware-status" style={{ marginTop: '4px', flexBasis: '100%' }}>
              <div className="hardware-status__title">{t('hardware.title')}</div>
              <div className="hardware-status__row">
                <span>{t('hardware.singleReq')}</span>
                <span className="hardware-status__value">
                  RAM: {(singleReq.ram / 1024).toFixed(2)} GB / VRAM:{' '}
                  {(singleReq.vram / 1024).toFixed(2)} GB
                </span>
              </div>
              <div className="hardware-status__row">
                <span>{t('hardware.totalReq', { n: concurrency })}</span>
                <span
                  className="hardware-status__value"
                  style={{
                    fontWeight: 600,
                    color: concurrency > maxRecommendedConcurrency ? 'var(--danger)' : 'var(--text)'
                  }}
                >
                  RAM: {(totalReq.ram / 1024).toFixed(2)} GB / VRAM:{' '}
                  {(totalReq.vram / 1024).toFixed(2)} GB
                </span>
              </div>
              {hardware && (
                <>
                  <div className="hardware-status__row">
                    <span>{t('hardware.freeRam')}</span>
                    <span className="hardware-status__value">
                      {(hardware.ram.free / 1024).toFixed(1)} /{' '}
                      {(hardware.ram.total / 1024).toFixed(0)} GB
                    </span>
                  </div>
                  <div className="hardware-status__row">
                    <span>{t('hardware.freeVram')}</span>
                    <span className="hardware-status__value">
                      {hardware.gpu
                        ? hardware.gpu.total > 0
                          ? `${(hardware.gpu.free / 1024).toFixed(1)} / ${(hardware.gpu.total / 1024).toFixed(0)} GB (${hardware.gpu.name})`
                          : hardware.gpu.name
                        : t('hardware.gpuUnavailable')}
                    </span>
                  </div>
                  {concurrency > maxRecommendedConcurrency && (
                    <div className="hardware-status__warning">
                      {t('hardware.warning', {
                        batch: concurrency,
                        max: maxRecommendedConcurrency
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <HotwordEditor api={hotwordsApi} disabled={busy} />

          <QueueList
            items={items}
            onRemove={remove}
            onCancel={cancel}
            onExport={exportItem}
            onResplit={resplitItem}
            onSetTrack={setTrack}
            onAddTrackItem={addTrackItem}
            uiTheme={theme.uiTheme}
          />
        </>
      )}
    </div>
  )
}

export default App
