import type { TranscriptResult, Word } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
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

function WordChip({
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
}

function segmentKey(seg: TranscriptResult['segments'][number]): string {
  return `${seg.start}-${seg.end}-${seg.text}`
}

function wordKey(word: Word): string {
  return `${word.start}-${word.end}-${word.text}`
}

export function TranscriptView({ result, filePath }: Props): React.JSX.Element {
  const t = useTranslation()
  const { mediaRef, activeSegment, activeWord, seekTo } = useMediaSync(result.segments)
  const activeRef = useRef<HTMLDivElement | null>(null)

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
          <div
            className={`segment${isActive ? ' segment--active' : ''}`}
            key={segmentKey(seg)}
            ref={isActive ? activeRef : undefined}
          >
            <button
              type="button"
              className="segment__time"
              onClick={() => seekTo(seg.start)}
              title={t('transcript.seekHere')}
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
                    onSeek={seekTo}
                  />
                ))
              ) : (
                <button type="button" className="segment__plain" onClick={() => seekTo(seg.start)}>
                  {seg.text}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
