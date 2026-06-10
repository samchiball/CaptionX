import type { JobProgress, JobStage } from '@shared/types'
import { useEffect, useRef, useState } from 'react'
import type { TranslateFn } from '../i18n'
import { useTranslation } from '../i18n'
import type { MessageKey } from '../i18n/translations'
import { estimateRemainingMs, formatDuration } from '../progress'

const STAGE_KEY: Record<JobStage, `stage.${JobStage}`> = {
  decode: 'stage.decode',
  transcribe: 'stage.transcribe',
  align: 'stage.align',
  export: 'stage.export'
}

interface Props {
  progress: JobProgress | null
  /** Processing start time (epoch ms). Used for elapsed time and ETA calculation. */
  startedAt: number | null
}

function translateMessage(message: string, t: TranslateFn): string {
  if (message.startsWith('progress.message.aligningWithCount:')) {
    const parts = message.split(':')
    const current = parts[1] ?? '0'
    const total = parts[2] ?? '0'
    return t('progress.message.aligningWithCount', { current, total })
  }
  if (message.startsWith('progress.message.')) {
    return t(message as MessageKey)
  }
  return message
}

export function ProgressBar({ progress, startedAt }: Props): React.JSX.Element {
  const t = useTranslation()
  const pct = progress?.pct ?? 0
  const label = progress ? t(STAGE_KEY[progress.stage]) : t('progress.preparing')

  // Re-render every second to advance the elapsed time (for long-running jobs).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ETA is estimated based on progress relative to time elapsed in the 'current stage'. Reset starting time when the stage changes.
  const stageRef = useRef<{ stage: JobStage | null; startedAt: number }>({
    stage: null,
    startedAt: now
  })
  if (progress && stageRef.current.stage !== progress.stage) {
    stageRef.current = { stage: progress.stage, startedAt: Date.now() }
  }

  const totalElapsed = startedAt ? Math.max(0, now - startedAt) : 0
  const remainingMs = estimateRemainingMs(now - stageRef.current.startedAt, pct)

  return (
    <div className="progress">
      <div className="progress__head">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="progress__track">
        <div className="progress__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="progress__meta">
        <span>{t('progress.elapsed', { duration: formatDuration(totalElapsed / 1000) })}</span>
        {remainingMs !== null && (
          <span>{t('progress.remaining', { duration: formatDuration(remainingMs / 1000) })}</span>
        )}
      </div>
      {progress?.message && (
        <p className="progress__message">{translateMessage(progress.message, t)}</p>
      )}
    </div>
  )
}
