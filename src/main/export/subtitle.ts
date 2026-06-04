import type { ExportFormat, TranscriptResult } from '@shared/types'
import { formatTimecode } from './timecode'

/** SRT 직렬화 (세그먼트 단위) */
export function toSrt(result: TranscriptResult): string {
  return result.segments
    .map((seg, i) => {
      const start = formatTimecode(seg.start, ',')
      const end = formatTimecode(seg.end, ',')
      return `${i + 1}\n${start} --> ${end}\n${seg.text.trim()}\n`
    })
    .join('\n')
}

/**
 * VTT 직렬화. includeWords=true 이면 WebVTT 인라인 타임스탬프 태그로 단어 시점을 표기.
 * 예: "<00:00:01.000>안녕 <00:00:01.420>하세요"
 */
export function toVtt(result: TranscriptResult, includeWords: boolean): string {
  const cues = result.segments.map((seg) => {
    const start = formatTimecode(seg.start, '.')
    const end = formatTimecode(seg.end, '.')
    let body = seg.text.trim()
    if (includeWords && seg.words.length > 0) {
      body = seg.words
        .map((w) => `<${formatTimecode(w.start, '.')}>${w.text}`)
        .join(' ')
        .trim()
    }
    return `${start} --> ${end}\n${body}`
  })
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

/** JSON 직렬화. includeWords=false 면 단어 배열 제거 */
export function toJson(result: TranscriptResult, includeWords: boolean): string {
  if (includeWords) {
    return JSON.stringify(result, null, 2)
  }
  const stripped: TranscriptResult = {
    language: result.language,
    segments: result.segments.map(({ start, end, text }) => ({
      start,
      end,
      text,
      words: []
    }))
  }
  return JSON.stringify(stripped, null, 2)
}

export function serialize(
  result: TranscriptResult,
  format: ExportFormat,
  includeWords: boolean
): string {
  switch (format) {
    case 'srt':
      return toSrt(result)
    case 'vtt':
      return toVtt(result, includeWords)
    case 'json':
      return toJson(result, includeWords)
  }
}

/** 포맷별 파일 확장자 */
export function extensionFor(format: ExportFormat): string {
  return `.${format}`
}
