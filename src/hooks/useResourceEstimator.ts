import type { HardwareInfo } from '@shared/types'
import { useEffect, useState } from 'react'
import { api } from '@/api'

export interface ModelResourceRequirement {
  whisperRam: number
  whisperVram: number
  alignRam: number
  alignVram: number
  ram: number // total single task ram (whisperRam + alignRam)
  vram: number // total single task vram (whisperVram + alignVram)
}

export function estimateModelMemory(
  model: string,
  align: boolean,
  alignMode: string,
  language?: string
): ModelResourceRequirement {
  let whisperRam = 250
  let whisperVram = 300

  switch (model) {
    case 'tiny':
      whisperRam = 150
      whisperVram = 200
      break
    case 'tiny-q5_1':
      whisperRam = 100
      whisperVram = 120
      break
    case 'base':
      whisperRam = 250
      whisperVram = 300
      break
    case 'base-q5_1':
      whisperRam = 180
      whisperVram = 200
      break
    case 'small':
      whisperRam = 900
      whisperVram = 1000
      break
    case 'small-q5_1':
      whisperRam = 500
      whisperVram = 600
      break
    case 'medium':
      whisperRam = 3000
      whisperVram = 3500
      break
    case 'medium-q5_0':
      whisperRam = 1100
      whisperVram = 1300
      break
    case 'large-v3-turbo':
      whisperRam = 3200
      whisperVram = 3700
      break
    case 'large-v3-turbo-q5_0':
      whisperRam = 1200
      whisperVram = 1400
      break
    case 'large-v3':
      whisperRam = 6000
      whisperVram = 6500
      break
    case 'large-v3-q5_0':
      whisperRam = 2000
      whisperVram = 2300
      break
  }

  let alignRam = 0
  let alignVram = 0

  if (align) {
    if (alignMode === 'mms') {
      alignRam = 800
      alignVram = 800
    } else if (alignMode === 'wav2vec2') {
      const lang = (language ?? '').toLowerCase().split(/[-_]/)[0]
      // 전용 대형 모델(~1.2GB) + 다국어-56 공유 모델(~1.2GB)을 쓰는 언어들
      const largeWav2Vec2 = [
        'ko',
        'ja',
        'es',
        'fr',
        'de',
        'it',
        'pt', // FinDIT full-precision
        'nl',
        'uk',
        'cs',
        'el',
        'hu',
        'fi',
        'ro',
        'ar',
        'hi',
        'id',
        'th',
        'vi' // 다국어-56
      ]
      const isLargeWav2Vec2 = largeWav2Vec2.includes(lang)
      if (isLargeWav2Vec2) {
        alignRam = 2500
        alignVram = 2500
      } else {
        alignRam = 500
        alignVram = 500
      }
    }
  }

  return {
    whisperRam,
    whisperVram,
    alignRam,
    alignVram,
    ram: whisperRam + alignRam,
    vram: whisperVram + alignVram
  }
}

export function useResourceEstimator(
  model: string,
  align: boolean,
  alignMode: string,
  gpu: boolean,
  concurrency: number,
  language?: string
) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null)

  useEffect(() => {
    let active = true

    const updateInfo = async (): Promise<void> => {
      try {
        const info = await api.getHardwareInfo()
        if (active) setHardware(info)
      } catch (err) {
        console.error('Failed to get hardware info:', err)
      }
    }

    updateInfo()
    const timer = setInterval(updateInfo, 5000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const singleReq = estimateModelMemory(model, align, alignMode, language)

  // Total resources: Whisper context is loaded per worker, while wav2vec2 align session is globally cached and shared.
  const totalReq = {
    ram: singleReq.whisperRam * concurrency + singleReq.alignRam,
    vram: singleReq.whisperVram * concurrency + singleReq.alignVram
  }

  let maxRecommendedConcurrency = 1
  if (hardware) {
    if (gpu && hardware.gpu) {
      // (Free VRAM - Align VRAM) / Whisper VRAM
      const vramLimit = Math.floor(
        Math.max(0, hardware.gpu.free - singleReq.alignVram) / singleReq.whisperVram
      )
      // (Free RAM - Align RAM) / Whisper RAM
      const ramLimit = Math.floor(
        Math.max(0, hardware.ram.free - singleReq.alignRam) / singleReq.whisperRam
      )
      maxRecommendedConcurrency = Math.min(vramLimit, ramLimit)
    } else {
      // Scale by RAM only: (Free RAM - Align RAM) / Whisper RAM
      maxRecommendedConcurrency = Math.floor(
        Math.max(0, hardware.ram.free - singleReq.alignRam) / singleReq.whisperRam
      )
    }
    // Clamp recommendation to range [1..32]
    maxRecommendedConcurrency = Math.max(1, Math.min(32, maxRecommendedConcurrency))
  }

  return {
    hardware,
    singleReq,
    totalReq,
    maxRecommendedConcurrency
  }
}
