import type { AudioTrack } from '@shared/types'
import { describe, expect, it } from 'vitest'
import type { TParams } from './i18n/format'
import type { MessageKey } from './i18n/translations'
import { isMultiTrack, trackLabel } from './tracks'

// 라벨 합성 규칙만 검증하면 되므로 키를 그대로 채워 넣는 간단한 t 스텁을 쓴다.
const t = (key: MessageKey, params?: TParams): string => {
  if (key === 'track.name') return `Track ${params?.index}`
  if (key === 'track.mono') return 'Mono'
  if (key === 'track.stereo') return 'Stereo'
  if (key === 'track.channels') return `${params?.count} ch`
  return key
}

describe('trackLabel', () => {
  it('순번(1-based)·스테레오·코덱·언어를 점으로 잇는다', () => {
    const track: AudioTrack = { index: 0, codec: 'aac', channels: 2, language: 'eng' }
    expect(trackLabel(track, t)).toBe('Track 1 · Stereo · aac (eng)')
  })

  it('제목 태그가 있으면 순번 다음에 보여 준다', () => {
    const track: AudioTrack = {
      index: 1,
      codec: 'ac3',
      channels: 6,
      title: 'Director Commentary'
    }
    expect(trackLabel(track, t)).toBe('Track 2 · Director Commentary · 6 ch · ac3')
  })

  it('언어·채널이 미상이면 해당 부분을 생략한다', () => {
    const track: AudioTrack = { index: 0, codec: 'mp3', channels: 0 }
    expect(trackLabel(track, t)).toBe('Track 1 · mp3')
  })
})

describe('isMultiTrack', () => {
  it('null·0개·1개는 멀티트랙이 아니다', () => {
    expect(isMultiTrack(null)).toBe(false)
    expect(isMultiTrack([])).toBe(false)
    expect(isMultiTrack([{ index: 0, codec: 'aac', channels: 2 }])).toBe(false)
  })

  it('2개 이상이면 멀티트랙이다', () => {
    expect(
      isMultiTrack([
        { index: 0, codec: 'aac', channels: 2 },
        { index: 1, codec: 'ac3', channels: 6 }
      ])
    ).toBe(true)
  })
})
