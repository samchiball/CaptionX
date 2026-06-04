/** 초 → "HH:MM:SS,mmm" (SRT) 또는 "HH:MM:SS.mmm" (VTT) */
export function formatTimecode(seconds: number, msSeparator: ',' | '.'): string {
  const clamped = Math.max(0, seconds)
  const totalMs = Math.round(clamped * 1000)
  const ms = totalMs % 1000
  const totalSec = Math.floor(totalMs / 1000)
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60) % 60
  const h = Math.floor(totalSec / 3600)
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${msSeparator}${pad(ms, 3)}`
}

/**
 * "HH:MM:SS.mmm" 또는 "HH:MM:SS,mmm" 타임코드 문자열을 초로 파싱한다.
 * whisper.cpp 애드온이 돌려주는 타임스탬프 형식을 받는다.
 */
export function parseTimecode(value: string): number {
  const m = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})$/)
  if (!m) return 0
  const [, h, min, s, frac] = m
  const ms = Number(frac.padEnd(3, '0'))
  return Number(h) * 3600 + Number(min) * 60 + Number(s) + ms / 1000
}
