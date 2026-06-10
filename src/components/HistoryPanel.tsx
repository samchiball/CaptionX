import type {
  ExportOptions,
  HistoryEntryMeta,
  ResplitOptions,
  TranscriptResult
} from '@shared/types'
import { useMemo, useState } from 'react'
import type { HistoryApi } from '../hooks/useHistory'
import type { UiThemePreference } from '../hooks/useTheme'
import { useTranslation } from '../i18n'
import { CloseIcon } from './DoodleIcons'
import { ExportBar } from './ExportBar'
import { ResplitBar } from './ResplitBar'
import { TranscriptView } from './TranscriptView'

function formatDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface RowProps {
  entry: HistoryEntryMeta
  api: HistoryApi
  uiTheme: UiThemePreference
}

function Row({ entry, api, uiTheme }: RowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<TranscriptResult | null>(null)
  const [busy, setBusy] = useState(false)
  const t = useTranslation()

  // 후편집·내보내기 전에 항목을 메인 결과 맵에 적재한다(한 번만).
  const ensureLoaded = async (): Promise<void> => {
    if (result) return
    setBusy(true)
    try {
      setResult(await api.load(entry.id))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (): Promise<void> => {
    if (open) {
      setOpen(false)
      return
    }
    await ensureLoaded()
    setOpen(true)
  }

  const handleResplit = async (options: ResplitOptions): Promise<void> => {
    await ensureLoaded()
    setResult(await api.resplit(entry.id, options))
  }

  const handleExport = async (options: ExportOptions): Promise<string | null> => {
    await ensureLoaded()
    return api.exportEntry(entry.id, options)
  }

  return (
    <li className="qitem qitem--done">
      <div className="qitem__head">
        <span className="qitem__name" title={entry.sourcePath}>
          {entry.name}
        </span>
        <span className="history__meta">
          {formatDate(entry.createdAt)} · {entry.language || t('history.autoLanguage')} ·{' '}
          {entry.model} · {t('history.segments', { n: entry.segmentCount })}
        </span>
        <button type="button" className="qitem__toggle" onClick={toggle} disabled={busy}>
          {busy && !result
            ? t('history.loading')
            : open
              ? t('queue.hide')
              : t('queue.showSubtitle')}
        </button>
        <button
          type="button"
          className="qitem__remove"
          onClick={() => void api.remove(entry.id)}
          aria-label={t('history.removeAria')}
        >
          <CloseIcon uiTheme={uiTheme} />
        </button>
      </div>

      <div className="qitem__result">
        <ExportBar disabled={false} onExport={handleExport} />
        <ResplitBar disabled={false} onResplit={handleResplit} />
        {open && result && <TranscriptView result={result} filePath={entry.sourcePath} />}
      </div>
    </li>
  )
}

interface Props {
  api: HistoryApi
  uiTheme: UiThemePreference
}

export function HistoryPanel({ api, uiTheme }: Props): React.JSX.Element {
  const { entries, loading, refresh } = api
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest')
  const t = useTranslation()

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) =>
        sortBy === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
      ),
    [entries, sortBy]
  )

  return (
    <section className="history">
      <div className="history__bar">
        <h2 className="history__title">{t('history.title')}</h2>
        <div className="history__actions">
          <div className="history__sort-buttons">
            <button
              type="button"
              className={`btn-sort ${sortBy === 'newest' ? 'btn-sort--active' : ''}`}
              onClick={() => setSortBy('newest')}
            >
              {t('history.sort.newest')}
            </button>
            <button
              type="button"
              className={`btn-sort ${sortBy === 'oldest' ? 'btn-sort--active' : ''}`}
              onClick={() => setSortBy('oldest')}
            >
              {t('history.sort.oldest')}
            </button>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void refresh()}>
            {t('history.refresh')}
          </button>
        </div>
      </div>
      {sortedEntries.length === 0 ? (
        <p className="history__empty">{loading ? t('history.loading') : t('history.empty')}</p>
      ) : (
        <ul className="queue">
          {sortedEntries.map((entry) => (
            <Row key={entry.id} entry={entry} api={api} uiTheme={uiTheme} />
          ))}
        </ul>
      )}
    </section>
  )
}
