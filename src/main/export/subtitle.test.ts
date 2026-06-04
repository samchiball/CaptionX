import type { TranscriptResult } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { serialize, toJson, toSrt, toVtt } from './subtitle'
import { formatTimecode } from './timecode'

const sample: TranscriptResult = {
  language: 'ko',
  segments: [
    {
      start: 0,
      end: 1.5,
      text: '안녕하세요',
      words: [
        { text: '안녕', start: 0, end: 0.6, score: 0.9 },
        { text: '하세요', start: 0.6, end: 1.5, score: 0.8 }
      ]
    },
    {
      start: 2,
      end: 3.25,
      text: '반갑습니다',
      words: [{ text: '반갑습니다', start: 2, end: 3.25, score: 0.95 }]
    }
  ]
}

describe('formatTimecode', () => {
  it('SRT는 콤마 밀리초 구분자를 쓴다', () => {
    expect(formatTimecode(0, ',')).toBe('00:00:00,000')
    expect(formatTimecode(1.5, ',')).toBe('00:00:01,500')
    expect(formatTimecode(3661.234, ',')).toBe('01:01:01,234')
  })

  it('VTT는 점 밀리초 구분자를 쓴다', () => {
    expect(formatTimecode(1.5, '.')).toBe('00:00:01.500')
  })

  it('음수는 0으로 클램프한다', () => {
    expect(formatTimecode(-5, ',')).toBe('00:00:00,000')
  })
})

describe('toSrt', () => {
  it('순번/타임코드/텍스트를 가진 큐를 만든다', () => {
    const srt = toSrt(sample)
    expect(srt).toContain('1\n00:00:00,000 --> 00:00:01,500\n안녕하세요')
    expect(srt).toContain('2\n00:00:02,000 --> 00:00:03,250\n반갑습니다')
  })
})

describe('toVtt', () => {
  it('WEBVTT 헤더로 시작한다', () => {
    expect(toVtt(sample, false).startsWith('WEBVTT')).toBe(true)
  })

  it('includeWords=true면 인라인 단어 타임스탬프를 넣는다', () => {
    const vtt = toVtt(sample, true)
    expect(vtt).toContain('<00:00:00.000>안녕 <00:00:00.600>하세요')
  })
})

describe('toJson', () => {
  it('includeWords=false면 words를 비운다', () => {
    const parsed = JSON.parse(toJson(sample, false)) as TranscriptResult
    expect(parsed.segments[0].words).toEqual([])
  })

  it('includeWords=true면 words를 유지한다', () => {
    const parsed = JSON.parse(toJson(sample, true)) as TranscriptResult
    expect(parsed.segments[0].words).toHaveLength(2)
  })
})

describe('serialize', () => {
  it('포맷에 맞는 직렬화를 위임한다', () => {
    expect(serialize(sample, 'srt', false)).toBe(toSrt(sample))
    expect(serialize(sample, 'vtt', true)).toBe(toVtt(sample, true))
    expect(serialize(sample, 'json', true)).toBe(toJson(sample, true))
  })
})
