import type { Segment, TranscriptResult, Word } from '@shared/types'
import { memo, useEffect, useRef, useState } from 'react'
import { useMediaSync } from '../hooks/useMediaSync'
import { useTranslation } from '../i18n'
import { MediaPlayer } from './MediaPlayer'

function fmt(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = (sec % 60).toFixed(2).padStart(5, '0')
  return `${String(m).padStart(2, '0')}:${s}`
}

interface Props {
  result: TranscriptResult
  /** 원본 미디어 절대 경로(재생용) */
  filePath: string
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
 * 단일 세그먼트 행. memo로 감싸 활성 상태(isActive/activeWord)가 바뀐 세그먼트만
 * 재렌더하도록 한다. 재생 중 활성 인덱스가 바뀌어도 직전/현재 세그먼트 2개만
 * 갱신되어, 긴 전사에서도 단어 칩 전체를 재조정하지 않는다.
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

export function TranscriptView({ result, filePath }: Props): React.JSX.Element {
  const t = useTranslation()
  const seekHereLabel = t('transcript.seekHere')
  const { mediaRef, activeSegment, activeWord, seekTo } = useMediaSync(result.segments)
  const activeRef = useRef<HTMLDivElement | null>(null)
  // 활성 세그먼트에만 붙는 안정적인 콜백 ref. memo된 SegmentRow의 props 동일성을
  // 유지하기 위해 매 렌더 새 함수를 만들지 않는다.
  const setActiveNode = useRef((node: HTMLDivElement | null) => {
    activeRef.current = node
  }).current

  // 활성 세그먼트가 화면 밖이면 부드럽게 추적한다.
  useEffect(() => {
    void activeSegment
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeSegment])

  // 재생용 오디오를 추출(브라우저 호환)하고 그 경로로 소스를 만든다.
  const [src, setSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<'preparing' | 'ready' | 'error'>('preparing')
  useEffect(() => {
    let cancelled = false
    setStatus('preparing')
    setSrc(null)
    window.api
      .prepareMedia(filePath)
      .then((audioPath) => {
        if (cancelled) return
        setSrc(window.api.mediaUrl(audioPath))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [filePath])

  return (
    <div className="transcript">
      <MediaPlayer ref={mediaRef} src={src} status={status} />
      <div className="transcript__meta">
        {t('transcript.language', { language: result.language })}
      </div>
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
  )
}
