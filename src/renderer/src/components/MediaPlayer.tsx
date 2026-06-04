import { forwardRef } from 'react'
import { useTranslation } from '../i18n'

interface Props {
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

/**
 * 자막 타이밍 검증용 오디오 플레이어.
 * 원본 영상 코덱이 브라우저에서 디코드 불가일 수 있어, 메인에서 추출한
 * 오디오(m4a)를 재생한다. ref는 useMediaSync에서 currentTime 추적/seek에 쓴다.
 */
export const MediaPlayer = forwardRef<HTMLMediaElement, Props>(function MediaPlayer(
  { src, status },
  ref
) {
  const t = useTranslation()
  const { showPreparing, showError, showControls } = mediaPlayerViewState(status, src)

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
      <audio
        ref={ref as React.Ref<HTMLAudioElement>}
        className="media-player media-player--audio"
        src={src || undefined}
        controls
        preload="metadata"
        style={{ display: showControls ? 'block' : 'none' }}
      />
    </div>
  )
})
