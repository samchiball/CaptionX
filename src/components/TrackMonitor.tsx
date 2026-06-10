import type { AudioTrack } from '@shared/types'
import { memo, useEffect, useRef, useState } from 'react'
import { useTranslation } from '../i18n'
import { MediaPlayer } from './MediaPlayer'
import { TrackSelector } from './TrackSelector'
import { api } from '@/api'

interface Props {
  /** 원본 미디어 절대 경로(트랙별 오디오 추출용). */
  filePath: string
  /** 선택 가능한 오디오 트랙들(최소 1개). */
  tracks: AudioTrack[]
  /** 현재 선택된 트랙 순번(0부터). 이 트랙이 전사에 그대로 쓰인다. */
  value: number
  /** 이미 큐에 등록된 트랙 인덱스들 */
  addedTracks?: number[]
  /** 트랙 변경 콜백. */
  onChange: (trackIndex: number) => void
  /** 트랙 복제 추가 콜백. */
  onAddTrackItem?: (filePath: string, trackIndex: number, tracks: AudioTrack[]) => void
  /** 처리 중 등으로 비활성화할지. */
  disabled?: boolean
}

/**
 * 대기 중인 큐 항목용 트랙 선택 + 들어보기(모니터링) 패널.
 *
 * 트랙 라벨만으로 구분이 어려운 경우(예: 모두 "트랙 N · 스테레오 · aac (und)")
 * 사용자가 직접 들어 보고 전사할 트랙을 고를 수 있게 한다. 여기서 고른 트랙이
 * 곧 전사에 쓰이는 트랙이다(QueueList → useBatch.trackIndex → audioTrackIndex).
 *
 * 들어보기 버튼 없이 바로 모니터링 플레이어와 웨이브폼이 표시되도록 하며,
 * 마운트 및 트랙 변경 시 해당 트랙 오디오를 자동으로 준비하여 로드한다.
 */
export const TrackMonitor = memo(function TrackMonitor({
  filePath,
  tracks,
  value,
  addedTracks,
  onChange,
  onAddTrackItem,
  disabled
}: Props): React.JSX.Element {
  const [audioPath, setAudioPath] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<'preparing' | 'ready' | 'error'>('preparing')
  const audioRef = useRef<HTMLAudioElement>(null)

  // 컴포넌트 마운트 시와 선택 트랙이 바뀔 때마다 해당 트랙 오디오를 자동으로 준비한다.
  useEffect(() => {
    let cancelled = false
    setStatus('preparing')
    setSrc(null)
    setAudioPath(null)
    api
      .prepareMedia(filePath, value)
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
  }, [filePath, value])

  const t = useTranslation()
  const remainingTracks = tracks.filter((tk) => !addedTracks?.includes(tk.index))
  const canAdd = remainingTracks.length > 0 && !disabled

  const handleAddTrack = (): void => {
    if (remainingTracks.length > 0 && onAddTrackItem) {
      onAddTrackItem(filePath, remainingTracks[0].index, tracks)
    }
  }

  return (
    <div className="track-monitor">
      <div className="track-monitor__row">
        <TrackSelector
          tracks={tracks}
          value={value}
          onChange={onChange}
          labelKey="track.select"
          disabled={disabled}
        />
        {canAdd && (
          <button
            type="button"
            className="track-monitor__add-btn"
            onClick={handleAddTrack}
            title={t('track.add')}
          >
            +
          </button>
        )}
      </div>
      <MediaPlayer ref={audioRef} audioPath={audioPath} src={src} status={status} />
    </div>
  )
})
