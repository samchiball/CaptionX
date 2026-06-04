import type { ExportOptions, ResplitOptions } from '@shared/types'
import { memo, useState } from 'react'
import type { ItemStatus, QueueItem } from '../hooks/useBatch'
import type { UiThemePreference } from '../hooks/useTheme'
import { useTranslation } from '../i18n'
import { isMultiTrack } from '../tracks'
import { CloseIcon } from './DoodleIcons'
import { ExportBar } from './ExportBar'
import { ProgressBar } from './ProgressBar'
import { ResplitBar } from './ResplitBar'
import { TrackSelector } from './TrackSelector'
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
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onExport: (id: string, options: ExportOptions) => Promise<string | null>
  onResplit: (id: string, options: ResplitOptions) => Promise<void>
  onSetTrack: (id: string, trackIndex: number) => void
  uiTheme: UiThemePreference
}

// 진행률 이벤트는 초당 수회 도착하며 매번 items 배열이 새로 만들어진다. memo로 감싸
// 콜백·uiTheme이 안정적인 상태에서 실제로 바뀐 항목(item) 행만 리렌더되게 한다.
const Row = memo(function Row({
  item,
  onRemove,
  onCancel,
  onExport,
  onResplit,
  onSetTrack,
  uiTheme
}: RowProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const t = useTranslation()
  const hasResult = item.status === 'done' && item.result
  // 멀티트랙이고 아직 처리 전(대기·취소·오류)일 때만 전사 트랙을 고를 수 있다.
  // 진행 중·완료 후에는 이미 특정 트랙으로 처리되었으므로 잠근다.
  const canPickTrack =
    isMultiTrack(item.tracks) && item.status !== 'running' && item.status !== 'done'

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
        <TrackSelector
          tracks={item.tracks}
          value={item.trackIndex}
          onChange={(idx) => onSetTrack(item.id, idx)}
          labelKey="track.select"
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
  uiTheme: UiThemePreference
}

export function QueueList({
  items,
  onRemove,
  onCancel,
  onExport,
  onResplit,
  onSetTrack,
  uiTheme
}: Props): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <ul className="queue">
      {items.map((item) => (
        <Row
          key={item.id}
          item={item}
          onRemove={onRemove}
          onCancel={onCancel}
          onExport={onExport}
          onResplit={onResplit}
          onSetTrack={onSetTrack}
          uiTheme={uiTheme}
        />
      ))}
    </ul>
  )
}
