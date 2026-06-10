import type { AudioTrack } from '@shared/types'
import type { TranslateFn } from './i18n'

/**
 * 오디오 트랙을 사람이 읽는 한 줄 라벨로 만든다(순수 함수).
 * 예: "트랙 1 · 스테레오 · aac (eng)" / "Track 2 · Director Commentary · ac3".
 *
 * 제목 태그가 있으면 우선 보여 주고, 채널/코덱/언어를 점(·)으로 잇는다.
 * 누락된 필드는 건너뛰어 항상 의미 있는 라벨이 되도록 한다.
 */
export function trackLabel(track: AudioTrack, t: TranslateFn): string {
  const parts: string[] = [t('track.name', { index: track.index + 1 })]
  if (track.title) parts.push(track.title)
  if (track.channels === 1) parts.push(t('track.mono'))
  else if (track.channels === 2) parts.push(t('track.stereo'))
  else if (track.channels > 2) parts.push(t('track.channels', { count: track.channels }))

  const codecLang = [track.codec, track.language ? `(${track.language})` : '']
    .filter(Boolean)
    .join(' ')
  if (codecLang) parts.push(codecLang)
  return parts.join(' · ')
}

/** 항목이 멀티트랙(오디오 트랙 2개 이상)인지 판별한다(순수 함수). */
export function isMultiTrack(tracks: AudioTrack[] | null): tracks is AudioTrack[] {
  return tracks !== null && tracks.length > 1
}
