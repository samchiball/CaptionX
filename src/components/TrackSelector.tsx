import type { AudioTrack } from '@shared/types'
import { memo } from 'react'
import { useTranslation } from '../i18n'
import { trackLabel } from '../tracks'

interface Props {
  /** 선택 가능한 오디오 트랙들(멀티트랙일 때만 렌더하는 것을 권장). */
  tracks: AudioTrack[]
  /** 현재 선택된 트랙 순번(0부터). */
  value: number
  /** 트랙 변경 콜백. */
  onChange: (trackIndex: number) => void
  /** 라벨 텍스트 키 구분: 전사 선택('track.select') vs 모니터링('track.monitor'). */
  labelKey: 'track.select' | 'track.monitor'
  /** 처리 중 등으로 비활성화할지. */
  disabled?: boolean
}

/**
 * 멀티 오디오 트랙 중 하나를 고르는 드롭다운. 큐 항목의 전사 트랙 선택과
 * 자막 화면의 모니터링 트랙 전환에 공유한다.
 */
export const TrackSelector = memo(function TrackSelector({
  tracks,
  value,
  onChange,
  labelKey,
  disabled
}: Props): React.JSX.Element {
  const t = useTranslation()
  return (
    <label className="track-selector">
      <span className="track-selector__label">{t(labelKey)}</span>
      <select
        className="track-selector__select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {tracks.map((track) => (
          <option key={track.index} value={track.index}>
            {trackLabel(track, t)}
          </option>
        ))}
      </select>
    </label>
  )
})
