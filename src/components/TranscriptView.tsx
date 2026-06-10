import type { AudioTrack, Segment, TranscriptResult, Word } from '@shared/types'
import { memo, useEffect, useRef, useState } from 'react'
import { useMediaSync } from '../hooks/useMediaSync'
import { useTranslation } from '../i18n'
import { isMultiTrack } from '../tracks'
import { MediaPlayer } from './MediaPlayer'
import { TrackSelector } from './TrackSelector'
import { api } from '@/api'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(2).padStart(5, '0')
  return `${String(m).padStart(2, '0')}:${s}`
}

interface Props {
  result: TranscriptResult
  /** Absolute path of original media (for playback) */
  filePath: string
  /** List of audio tracks in the file (shows monitoring track switcher UI if multi-track). */
  tracks?: AudioTrack[] | null
  /** Default monitoring track (usually the one used for transcription). Only meaningful for multi-track. */
  initialTrackIndex?: number
}

const WordChip = memo(function WordChip({
  word,
  active,
  onSeek
}: {
  word: Word
  active: boolean
  onSeek: (sec: number) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`word${active ? ' word--active' : ''}`}
      title={`${fmt(word.start)} → ${fmt(word.end)} (${word.score.toFixed(2)})`}
      onClick={() => onSeek(word.start)}
    >
      {word.text}
    </button>
  )
})

function segmentKey(seg: Segment): string {
  return `${seg.start}-${seg.end}-${seg.text}`
}

function wordKey(word: Word): string {
  return `${word.start}-${word.end}-${word.text}`
}

/**
 * A single segment row. Wrapped in memo to re-render only when active states (isActive/activeWord) change.
 * When the active index changes during playback, only the previous and current segments are updated,
 * avoiding re-rendering all word chips even in long transcriptions.
 */
const SegmentRow = memo(function SegmentRow({
  seg,
  isActive,
  activeWord,
  onSeek,
  seekHereLabel,
  innerRef
}: {
  seg: Segment
  isActive: boolean
  activeWord: number
  onSeek: (sec: number) => void
  seekHereLabel: string
  innerRef: ((node: HTMLDivElement | null) => void) | undefined
}): React.JSX.Element {
  return (
    <div className={`segment${isActive ? ' segment--active' : ''}`} ref={innerRef}>
      <button
        type="button"
        className="segment__time"
        onClick={() => onSeek(seg.start)}
        title={seekHereLabel}
      >
        {fmt(seg.start)} → {fmt(seg.end)}
      </button>
      <div className="segment__text">
        {seg.words.length > 0 ? (
          seg.words.map((w, j) => (
            <WordChip
              word={w}
              key={wordKey(w)}
              active={isActive && j === activeWord}
              onSeek={onSeek}
            />
          ))
        ) : (
          <button type="button" className="segment__plain" onClick={() => onSeek(seg.start)}>
            {seg.text}
          </button>
        )}
      </div>
    </div>
  )
})

export function TranscriptView({
  result,
  filePath,
  tracks = null,
  initialTrackIndex = 0
}: Props): React.JSX.Element {
  const t = useTranslation()
  const seekHereLabel = t('transcript.seekHere')
  // Monitoring track. For multi-track, starts with the transcription track and can be switched freely.
  const multiTrack = isMultiTrack(tracks)
  const [monitorTrack, setMonitorTrack] = useState(initialTrackIndex)
  const { mediaRef, activeSegment, activeWord, seekTo } = useMediaSync(result.segments)
  const activeRef = useRef<HTMLDivElement | null>(null)
  // Stable callback ref attached only to the active segment. To maintain props equality of memoized SegmentRow,
  // we do not recreate a new function on every render.
  const setActiveNode = useRef((node: HTMLDivElement | null) => {
    activeRef.current = node
  }).current

  // Smoothly scroll to the active segment if it goes out of the viewport.
  useEffect(() => {
    void activeSegment
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeSegment])

  // Extract audio for playback (browser compatible) and create the source URL with it.
  // For multi-track, extracts only the selected monitoring track, preparing it again on track changes.
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<'preparing' | 'ready' | 'error'>('preparing')
  useEffect(() => {
    let cancelled = false
    setStatus('preparing')
    setSrc(null)
    setAudioPath(null)
    api
      .prepareMedia(filePath, multiTrack ? monitorTrack : undefined)
      .then((path) => {
        if (cancelled) return
        setAudioPath(path)
        setSrc(api.mediaUrl(path))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [filePath, multiTrack, monitorTrack])

  return (
    <div className="transcript">
      {multiTrack && tracks && (
        <TrackSelector
          tracks={tracks}
          value={monitorTrack}
          onChange={setMonitorTrack}
          labelKey="track.monitor"
        />
      )}
      <MediaPlayer ref={mediaRef} audioPath={audioPath} src={src} status={status} />
      <div className="transcript__meta">
        {t('transcript.language', { language: result.language })}
      </div>
      <div className="transcript__segments">
        {result.segments.map((seg, i) => {
          const isActive = i === activeSegment
          return (
            <SegmentRow
              key={segmentKey(seg)}
              seg={seg}
              isActive={isActive}
              activeWord={isActive ? activeWord : -1}
              onSeek={seekTo}
              seekHereLabel={seekHereLabel}
              innerRef={isActive ? setActiveNode : undefined}
            />
          )
        })}
      </div>
    </div>
  )
}
