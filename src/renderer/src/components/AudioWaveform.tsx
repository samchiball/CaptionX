import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'

interface Props {
  audio: HTMLAudioElement | null
  peaks: number[]
  onSeek: (sec: number) => void
  zoom: number // pixels per second (0 means fit screen)
  duration: number
}

function formatTime(sec: number): string {
  if (Number.isNaN(sec) || !Number.isFinite(sec)) return '00:00'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function AudioWaveform({ audio, peaks, onSeek, zoom, duration }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [wavesurfer, setWavesurfer] = useState<WaveSurfer | null>(null)
  const [hoverInfo, setHoverInfo] = useState<{ x: number; time: string } | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: zoom and duration are updated dynamically in another hook to avoid recreating wavesurfer
  useEffect(() => {
    if (!containerRef.current || !audio || peaks.length === 0) return

    const style = getComputedStyle(containerRef.current)
    const waveColor = style.getPropertyValue('--border-strong').trim() || '#787774'
    const progressColor = style.getPropertyValue('--accent').trim() || '#2383e2'

    const hasValidDuration = duration && !Number.isNaN(duration) && duration > 0
    const ws = WaveSurfer.create({
      container: containerRef.current,
      media: audio,
      peaks: [peaks],
      duration: hasValidDuration ? duration : undefined,
      waveColor,
      progressColor,
      height: 'auto',
      minPxPerSec: hasValidDuration ? zoom || 0 : 0,
      cursorWidth: 1,
      cursorColor: progressColor,
      interact: true,
      dragToSeek: false
    })

    setWavesurfer(ws)

    const handleInteraction = (newTime: number): void => {
      onSeek(newTime)
    }
    const unbindInteraction = ws.on('interaction', handleInteraction)

    return () => {
      unbindInteraction()
      ws.destroy()
      setWavesurfer(null)
    }
  }, [audio, peaks, onSeek])

  // Dynamically update WaveSurfer duration and zoom level
  useEffect(() => {
    if (wavesurfer && duration && !Number.isNaN(duration) && duration > 0) {
      try {
        const currentTime = wavesurfer.getCurrentTime()
        wavesurfer.setOptions({ duration })
        wavesurfer.zoom(zoom || 0)

        if (zoom > 0 && containerRef.current) {
          const clientWidth = containerRef.current.clientWidth
          const viewportDuration = clientWidth / zoom
          const targetLeftTime = currentTime - viewportDuration / 2
          wavesurfer.setScrollTime(Math.max(0, targetLeftTime))
        }
      } catch (err) {
        console.warn('[AudioWaveform] Zoom failed:', err)
      }
    }
  }, [wavesurfer, zoom, duration])

  // Dynamic color updates on theme change
  useEffect(() => {
    if (!wavesurfer || !containerRef.current) return

    const updateColors = (): void => {
      if (!containerRef.current) return
      const style = getComputedStyle(containerRef.current)
      const waveColor = style.getPropertyValue('--border-strong').trim() || '#787774'
      const progressColor = style.getPropertyValue('--accent').trim() || '#2383e2'
      wavesurfer.setOptions({
        waveColor,
        progressColor,
        cursorColor: progressColor
      })
    }

    const observer = new MutationObserver(updateColors)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-ui-theme']
    })

    return () => observer.disconnect()
  }, [wavesurfer])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    const el = containerRef.current
    if (!el || !audio) return
    const rect = el.getBoundingClientRect()
    // Accounting for wavesurfer horizontal scrolling offset (querying wavesurfer's inner scroll container)
    const scrollWrapper = el.querySelector('div')
    const scrollLeft = scrollWrapper?.scrollLeft || 0
    const x = e.clientX - rect.left + scrollLeft

    const totalWidth = scrollWrapper ? scrollWrapper.scrollWidth : rect.width
    const progress = Math.max(0, Math.min(1, x / totalWidth))

    const duration = audio.duration
    if (duration > 0 && !Number.isNaN(duration)) {
      const hoverTime = progress * duration
      // Show tooltip relative to screen viewport position, not scroll position
      const clientX = e.clientX - rect.left
      setHoverInfo({
        x: clientX,
        time: formatTime(hoverTime)
      })
    }
  }

  const handleMouseLeave = (): void => {
    setHoverInfo(null)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: purely presentational hover tracking for playhead timeline tooltip
    <div
      ref={containerRef}
      className="audio-waveform-container"
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {hoverInfo && (
        <div
          className="audio-waveform-tooltip"
          style={{
            position: 'absolute',
            left: `${hoverInfo.x}px`,
            bottom: '100%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          {hoverInfo.time}
        </div>
      )}
    </div>
  )
}
