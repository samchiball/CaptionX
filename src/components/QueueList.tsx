import type { AudioTrack, ExportOptions, ResplitOptions } from '@shared/types'
import { memo, useState } from 'react'
import type { ItemStatus, QueueItem } from '../hooks/useBatch'
import type { UiThemePreference } from '../hooks/useTheme'
import { useTranslation } from '../i18n'
import { CloseIcon } from './DoodleIcons'
import { ExportBar } from './ExportBar'
import { ProgressBar } from './ProgressBar'
import { ResplitBar } from './ResplitBar'
import { TrackMonitor } from './TrackMonitor'
import { TranscriptView } from './TranscriptView'

const STATUS_KEY: Record<ItemStatus, `status.${ItemStatus}`> = {
  pending: 'status.pending',
  running: 'status.running',
  done: 'status.done',
  error: 'status.error',
  canceled: 'status.canceled'
}

interface RowProps {
  item: QueueItem
  items: QueueItem[]
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onExport: (id: string, options: ExportOptions) => Promise<string | null>
  onResplit: (id: string, options: ResplitOptions) => Promise<void>
  onSetTrack: (id: string, trackIndex: number) => void
  onAddTrackItem: (filePath: string, trackIndex: number, tracks: AudioTrack[]) => void
  uiTheme: UiThemePreference
}

// Progress events arrive multiple times per second, recreating the items array each time. Wrapped in memo
// to ensure only the actually changed item rows re-render when callbacks/uiTheme are stable.
const Row = memo(function Row({
  item,
  items,
  onRemove,
  onCancel,
  onExport,
  onResplit,
  onSetTrack,
  onAddTrackItem,
  uiTheme
}: RowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const t = useTranslation()
  const hasResult = item.status === 'done' && item.result
  const addedTrackIndices = items
    .filter((it) => it.filePath === item.filePath)
    .map((it) => it.trackIndex)

  // When tracks have been probed (not an empty array) and processing has not started (pending/canceled/error),
  // expose track selection and monitoring (listening). Keep the dropdown for both single and multi-tracks.
  // Do not show after processing has started or completed as a specific track has already been chosen.
  const canPickTrack =
    (item.tracks?.length ?? 0) >= 1 && item.status !== 'running' && item.status !== 'done'

  return (
    <li className={`qitem qitem--${item.status}`}>
      <div className="qitem__head">
        <span className={`qitem__badge qitem__badge--${item.status}`}>
          {t(STATUS_KEY[item.status])}
        </span>
        <span className="qitem__name" title={item.filePath}>
          {item.name}
        </span>
        {hasResult && (
          <button type="button" className="qitem__toggle" onClick={() => setOpen((v) => !v)}>
            {open ? t('queue.hide') : t('queue.showSubtitle')}
          </button>
        )}
        {item.status === 'running' ? (
          <button type="button" className="qitem__cancel" onClick={() => onCancel(item.id)}>
            {t('queue.cancel')}
          </button>
        ) : (
          <button
            type="button"
            className="qitem__remove"
            onClick={() => onRemove(item.id)}
            aria-label={t('queue.removeAria')}
          >
            <CloseIcon uiTheme={uiTheme} />
          </button>
        )}
      </div>

      {canPickTrack && item.tracks && (
        <TrackMonitor
          filePath={item.filePath}
          tracks={item.tracks}
          value={item.trackIndex}
          addedTracks={addedTrackIndices}
          onChange={(idx) => onSetTrack(item.id, idx)}
          onAddTrackItem={onAddTrackItem}
        />
      )}

      {item.status === 'running' && (
        <ProgressBar progress={item.progress} startedAt={item.startedAt} />
      )}
      {item.status === 'error' && (
        <div className="error">{t('queue.error', { message: item.error ?? '' })}</div>
      )}
      {item.status === 'canceled' && <div className="qitem__canceled">{t('queue.canceled')}</div>}

      {hasResult && (
        <div className="qitem__result">
          <ExportBar disabled={false} onExport={(opts) => onExport(item.id, opts)} />
          <ResplitBar disabled={false} onResplit={(opts) => onResplit(item.id, opts)} />
          {open && item.result && (
            <TranscriptView
              result={item.result}
              filePath={item.filePath}
              tracks={item.tracks}
              initialTrackIndex={item.trackIndex}
            />
          )}
        </div>
      )}
    </li>
  )
})

interface Props {
  items: QueueItem[]
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onExport: (id: string, options: ExportOptions) => Promise<string | null>
  onResplit: (id: string, options: ResplitOptions) => Promise<void>
  onSetTrack: (id: string, trackIndex: number) => void
  onAddTrackItem: (filePath: string, trackIndex: number, tracks: AudioTrack[]) => void
  uiTheme: UiThemePreference
}

export function QueueList({
  items,
  onRemove,
  onCancel,
  onExport,
  onResplit,
  onSetTrack,
  onAddTrackItem,
  uiTheme
}: Props): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <ul className="queue">
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          items={items}
          onRemove={onRemove}
          onCancel={onCancel}
          onExport={onExport}
          onResplit={onResplit}
          onSetTrack={onSetTrack}
          onAddTrackItem={onAddTrackItem}
          uiTheme={uiTheme}
        />
      ))}
    </ul>
  )
}
