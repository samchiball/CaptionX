/** 장시간 작업 진행도 표시용 순수 헬퍼. */

/**
 * 초를 사람이 읽기 쉬운 경과 시간 문자열로 만든다.
 *  - 1시간 미만: "M:SS" (예: 0:42, 12:05)
 *  - 1시간 이상: "H:MM:SS" (예: 1:23:45)
 * 음수·비유한 값은 0초로 본다.
 */
export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

/**
 * 현재 단계의 경과 시간과 진행률(0..100)로 남은 시간을 선형 추정한다(밀리초).
 * 진행률이 0 이하·100 이상이거나 경과가 음수면 추정 불가로 null을 돌려준다.
 */
export function estimateRemainingMs(stageElapsedMs: number, pct: number): number | null {
  if (!Number.isFinite(stageElapsedMs) || stageElapsedMs < 0) return null
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null
  return (stageElapsedMs * (100 - pct)) / pct
}
