import { forwardRef, useCallback, useEffect, useState } from 'react'
import { useTranslation } from '../i18n'
import { AudioWaveform } from './AudioWaveform'

interface Props {
  /** 오디오 절대 경로 (waveform 추출용) */
  audioPath: string | null
  /** 재생 가능한 오디오 URL (captionx-media://...), 준비 전이면 null */
  src: string | null
  /** 준비 중/실패 상태 메시지 */
  status: 'preparing' | 'ready' | 'error'
}

export interface MediaPlayerViewState {
  showPreparing: boolean
  showError: boolean
  showControls: boolean
}

export function mediaPlayerViewState(
  status: Props['status'],
  src: string | null
): MediaPlayerViewState {
  return {
    showPreparing: status === 'preparing',
    showError: status === 'error',
    showControls: status === 'ready' && Boolean(src)
  }
}

function formatTime(sec: number, forceHours = false): string {
  if (Number.isNaN(sec) || !Number.isFinite(sec)) return '00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0 || forceHours) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 자막 타이밍 검증용 오디오 플레이어.
 * 원본 영상 코덱이 브라우저에서 디코드 불가일 수 있어, 메인에서 추출한
 * 오디오(m4a)를 재생한다. ref는 useMediaSync에서 currentTime 추적/seek에 쓴다.
 */
export const MediaPlayer = forwardRef<HTMLMediaElement, Props>(function MediaPlayer(
  { audioPath, src, status },
  ref
) {
  const t = useTranslation()
  const { showPreparing, showError, showControls } = mediaPlayerViewState(status, src)

  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1.0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [zoom, setZoom] = useState(10)

  // Fetch waveform peaks
  useEffect(() => {
    if (!audioPath) {
      setPeaks(null)
      return
    }
    let cancelled = false
    window.api
      .getWaveform(audioPath)
      .then((data) => {
        if (!cancelled) {
          setPeaks(data)
        }
      })
      .catch((err) => {
        console.error('[MediaPlayer] Failed to load waveform:', err)
      })
    return () => {
      cancelled = true
    }
  }, [audioPath])

  // Reset playback states when source URL changes (e.g., track transition)
  // biome-ignore lint/correctness/useExhaustiveDependencies: Reset states specifically when src changes
  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [src])

  // Track the audio element and forward the ref to parent useMediaSync hook
  const setAudioRef = useCallback(
    (node: HTMLAudioElement | null) => {
      setAudioEl(node)
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  // Listen to audio element events
  useEffect(() => {
    if (!audioEl) return

    const handlePlay = (): void => setIsPlaying(true)
    const handlePause = (): void => setIsPlaying(false)
    const handleVolume = (): void => {
      setIsMuted(audioEl.muted)
      setVolume(audioEl.volume)
    }
    const handleDuration = (): void => {
      if (audioEl.duration && !Number.isNaN(audioEl.duration)) {
        setDuration(audioEl.duration)
      }
    }
    const handleTime = (): void => {
      const cur = Math.floor(audioEl.currentTime)
      setCurrentTime((prev) => (prev === cur ? prev : cur))
    }

    // Initialize states
    setIsPlaying(!audioEl.paused)
    setIsMuted(audioEl.muted)
    setVolume(audioEl.volume)
    if (audioEl.duration && !Number.isNaN(audioEl.duration)) {
      setDuration(audioEl.duration)
    }

    audioEl.addEventListener('play', handlePlay)
    audioEl.addEventListener('playing', handlePlay)
    audioEl.addEventListener('pause', handlePause)
    audioEl.addEventListener('ended', handlePause)
    audioEl.addEventListener('volumechange', handleVolume)
    audioEl.addEventListener('durationchange', handleDuration)
    audioEl.addEventListener('loadedmetadata', handleDuration)
    audioEl.addEventListener('timeupdate', handleTime)

    return () => {
      audioEl.removeEventListener('play', handlePlay)
      audioEl.removeEventListener('playing', handlePlay)
      audioEl.removeEventListener('pause', handlePause)
      audioEl.removeEventListener('ended', handlePause)
      audioEl.removeEventListener('volumechange', handleVolume)
      audioEl.removeEventListener('durationchange', handleDuration)
      audioEl.removeEventListener('loadedmetadata', handleDuration)
      audioEl.removeEventListener('timeupdate', handleTime)
    }
  }, [audioEl])

  const togglePlay = (): void => {
    if (!audioEl) return
    if (isPlaying) {
      audioEl.pause()
    } else {
      audioEl.play().catch(() => {
        /* User gesture fallback */
      })
    }
  }

  const toggleMute = (): void => {
    if (!audioEl) return
    audioEl.muted = !audioEl.muted
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (!audioEl) return
    const vol = Number.parseFloat(e.target.value)
    audioEl.volume = vol
    audioEl.muted = vol === 0
  }

  const seekTo = (sec: number): void => {
    if (!audioEl) return
    audioEl.currentTime = sec
    setCurrentTime(Math.floor(sec))
  }

  return (
    <div className="media-player-container">
      {showPreparing && (
        <div className="media-player media-player--placeholder">{t('media.preparing')}</div>
      )}
      {showError && (
        <div className="media-player media-player--placeholder media-player--error">
          {t('media.error')}
        </div>
      )}

      {/* Hidden native audio element */}
      <audio
        ref={setAudioRef}
        src={src || undefined}
        preload="metadata"
        style={{ display: 'none' }}
      />

      {showControls && audioEl && (
        <div className="media-player-custom">
          {/* Play/Pause Button */}
          <button
            type="button"
            className="media-player-custom__btn"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="media-player-custom__icon" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="media-player-custom__icon" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Time Display */}
          <div className="media-player-custom__time">
            {formatTime(currentTime, duration > 3600)} / {formatTime(duration, duration > 3600)}
          </div>

          {/* Waveform Timeline */}
          <div className="media-player-custom__waveform-wrapper">
            {peaks ? (
              <AudioWaveform
                audio={audioEl}
                peaks={peaks}
                onSeek={seekTo}
                zoom={zoom}
                duration={duration}
              />
            ) : (
              <div className="media-player-custom__waveform-loading">{t('media.preparing')}</div>
            )}
          </div>

          {/* Zoom Control */}
          <div className="media-player-custom__zoom-container">
            <svg viewBox="0 0 24 24" className="media-player-custom__icon" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              type="range"
              min="0"
              max="35"
              step="1"
              value={zoom}
              onChange={(e) => setZoom(Number.parseInt(e.target.value, 10))}
              className="media-player-custom__zoom-slider"
              title="Zoom Waveform"
            />
          </div>

          {/* Volume Control */}
          <div className="media-player-custom__volume-container">
            <button
              type="button"
              className="media-player-custom__btn"
              onClick={toggleMute}
              aria-label={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <svg viewBox="0 0 24 24" className="media-player-custom__icon" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.21.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : volume < 0.5 ? (
                <svg viewBox="0 0 24 24" className="media-player-custom__icon" fill="currentColor">
                  <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="media-player-custom__icon" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L9 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="media-player-custom__volume-slider"
            />
          </div>
        </div>
      )}
    </div>
  )
})
