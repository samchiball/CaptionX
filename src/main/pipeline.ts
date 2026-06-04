import type { JobProgress, Segment, TranscribeOptions, TranscriptResult, Word } from '@shared/types'
import { alignWords } from './align/aligner'
import { loadAlignModel } from './align/model-loader'
import { computeEmission } from './align/wav2vec2'
import { buildHotwordPrompt, transcribe } from './asr/whisper'
import { decodeToPcm, TARGET_SAMPLE_RATE } from './audio/decode'
import { enhanceAudio } from './audio/enhance'
import { isCancellation, raceCancellation, throwIfCanceled } from './cancellation'
import {
  detectAlignLanguage,
  ensureGtcrnModel,
  hasAlignModel,
  isAutoLanguage
} from './models/manager'

export type ProgressFn = (p: Omit<JobProgress, 'jobId'>) => void

// 호환성을 위해 재노출한다(기존 import 경로 유지).
export { CancellationError, isCancellation } from './cancellation'

/** 내부 정렬 처리 방식. 'synthesize'는 세그먼트 텍스트 기반 근사 단어 생성. */
export type ResolvedAlignMode = 'wav2vec2' | 'mms' | 'synthesize'

/**
 * WhisperX 방식의 정렬 언어/모드 결정 (순수 함수).
 *  1) 사용자가 언어를 지정했으면 그 언어를 쓴다.
 *  2) '자동'이면 Whisper가 반환한 감지 언어(result.language)를 쓴다.
 *  3) 감지 언어가 비었을 때만 전사 텍스트 스크립트로 보조 추정한다.
 *  4) 그래도 지원 wav2vec2 모델이 없는 언어는 세그먼트 텍스트 기반 근사 단어로 폴백한다.
 */
export function resolveAlignment(
  options: TranscribeOptions,
  result: TranscriptResult
): { alignMode: ResolvedAlignMode; alignLanguage?: string } {
  if (options.alignMode === 'mms') {
    return { alignMode: 'mms', alignLanguage: options.language }
  }
  let alignLanguage = options.language
  if (isAutoLanguage(options.language)) {
    const detected = isAutoLanguage(result.language) ? undefined : result.language
    alignLanguage =
      detected ?? detectAlignLanguage(result.segments.map((seg) => seg.text).join(' '))
  }
  // 지원 정렬 모델이 없는 언어는 잘못된 모델로 정렬하지 않고 근사 단어로 폴백.
  return hasAlignModel(alignLanguage)
    ? { alignMode: 'wav2vec2', alignLanguage }
    : { alignMode: 'synthesize', alignLanguage }
}

export function resolveAlignmentConcurrency(gpu: boolean, segmentCount: number): number {
  if (segmentCount <= 0) return 0
  return gpu ? Math.min(4, segmentCount) : 1
}

/**
 * 전체 전사 파이프라인: 디코드 → Whisper 전사 → (옵션) wav2vec2 단어 강제정렬.
 */
export async function runTranscription(
  options: TranscribeOptions,
  onProgress: ProgressFn,
  signal?: AbortSignal
): Promise<TranscriptResult> {
  throwIfCanceled(signal)
  onProgress({ stage: 'decode', pct: 0, message: 'progress.message.decoding' })
  // 장시간 파일은 디코드도 수십 초~수 분 걸린다. 처리된 오디오 길이로 진행률을 보고한다.
  const pcm = await decodeToPcm(
    options.filePath,
    ({ processedSec, totalSec }) => {
      const scale = options.denoise ? 50 : 100
      const maxPct = options.denoise ? 49 : 99
      const pct =
        totalSec && totalSec > 0
          ? Math.min(maxPct, Math.round((processedSec / totalSec) * scale))
          : 0
      onProgress({ stage: 'decode', pct, message: 'progress.message.decoding' })
    },
    signal
  )
  throwIfCanceled(signal)

  let processedPcm = pcm
  if (options.denoise) {
    onProgress({ stage: 'decode', pct: 50, message: 'progress.message.denoisePreparing' })
    let downloadFired = false
    const modelPath = await ensureGtcrnModel(({ received, total }) => {
      downloadFired = true
      onProgress({
        stage: 'decode',
        pct: total > 0 ? 50 + Math.round((received / total) * 10) : 50,
        message: 'progress.message.denoiseDownloading'
      })
    })

    // 다운로드가 발생하지 않았더라도 다음 단계로 매끄럽게 진입
    if (!downloadFired) {
      onProgress({ stage: 'decode', pct: 60, message: 'progress.message.denoisePreparing' })
    }

    processedPcm = await enhanceAudio(
      pcm,
      modelPath,
      options.gpu,
      (denoisePct) => {
        const pct = 60 + Math.round((denoisePct / 100) * 39)
        onProgress({ stage: 'decode', pct, message: 'progress.message.denoising' })
      },
      signal
    )
    throwIfCanceled(signal)
  }
  onProgress({ stage: 'decode', pct: 100 })

  throwIfCanceled(signal)
  onProgress({ stage: 'transcribe', pct: 0, message: 'progress.message.transcribePreparing' })
  const prompt = buildHotwordPrompt(options.hotwords)

  let modelDownloadFired = false
  // whisper.cpp 네이티브 호출은 중단 API가 없다. abort 시 결과를 기다리지 않고
  // 즉시 취소로 처리해 UI를 풀고 JS 힙을 회수한다(네이티브 작업은 백그라운드 종료).
  const result = await raceCancellation(
    transcribe(processedPcm, {
      model: options.model,
      language: options.language,
      gpu: options.gpu,
      vad: options.vad,
      prompt,
      threads: options.threads,
      onModelProgress: ({ received, total }) => {
        modelDownloadFired = true
        onProgress({
          stage: 'transcribe',
          pct: total > 0 ? Math.round((received / total) * 30) : 0,
          message: 'progress.message.transcribeDownloading'
        })
      },
      // 장시간 파일은 전사 호출 한 번이 가장 오래 걸린다. 네이티브 진행률(0..100)을
      // 그대로 표시해 진행 표시가 멈춘 것처럼 보이지 않게 한다.
      onTranscribeProgress: (pct) => {
        const finalPct = modelDownloadFired ? 30 + Math.round((pct / 100) * 70) : pct
        onProgress({ stage: 'transcribe', pct: finalPct, message: 'progress.message.transcribing' })
      }
    }),
    signal
  )
  throwIfCanceled(signal)
  onProgress({ stage: 'transcribe', pct: 100 })

  if (!options.align || result.segments.length === 0) {
    return result
  }

  const { alignMode, alignLanguage } = resolveAlignment(options, result)

  // 지원 wav2vec2 모델이 없는 언어는 세그먼트 텍스트 기반 근사 단어로 채운다.
  if (alignMode === 'synthesize') {
    return synthesizeSegmentWords(result, onProgress)
  }

  // wav2vec2 정렬은 onnxruntime-node에 의존한다. prebuilt 바이너리가 없는 플랫폼
  // (예: Intel Mac)에서는 로드/세션 생성이 실패하므로, 그 경우 세그먼트 텍스트 기반
  // 근사 단어로 폴백해 전사 결과를 잃지 않는다.
  try {
    throwIfCanceled(signal)
    onProgress({ stage: 'align', pct: 0, message: 'progress.message.alignPreparing' })
    let alignModelDownloadFired = false
    const model = await loadAlignModel(
      options.gpu,
      alignMode,
      alignLanguage,
      ({ received, total }) => {
        alignModelDownloadFired = true
        onProgress({
          stage: 'align',
          pct: total > 0 ? Math.round((received / total) * 30) : 0,
          message: 'progress.message.alignDownloading'
        })
      }
    )
    const total = result.segments.length
    let completed = 0
    const concurrency = resolveAlignmentConcurrency(options.gpu, total)
    await parallelLimit(result.segments, concurrency, async (seg) => {
      throwIfCanceled(signal)
      const startSample = Math.floor(seg.start * TARGET_SAMPLE_RATE)
      const endSample = Math.min(processedPcm.length, Math.ceil(seg.end * TARGET_SAMPLE_RATE))
      if (endSample <= startSample) return
      const slice = processedPcm.subarray(startSample, endSample)
      const emission = await computeEmission(model.session, slice, model.normalize)
      const frames = emission.frames
      const duration = seg.end - seg.start
      const frameToTime = (f: number): number =>
        seg.start + (frames > 0 ? (f / frames) * duration : 0)
      seg.words = alignWords(emission, seg.text, model.vocab, frameToTime, model.blank)

      completed++
      const loopPct = Math.round((completed / total) * 100)
      const pct = alignModelDownloadFired ? 30 + Math.round((loopPct / 100) * 70) : loopPct
      onProgress({
        stage: 'align',
        pct,
        message: `progress.message.aligningWithCount:${completed}:${total}`
      })
    })
    return result
  } catch (err) {
    // 사용자가 취소한 경우는 폴백하지 않고 그대로 중단한다.
    if (isCancellation(err)) throw err
    console.error(
      'wav2vec2 정렬 실패, 세그먼트 텍스트 기반 근사 단어로 폴백합니다:',
      (err as Error).message
    )
    return synthesizeSegmentWords(result, onProgress)
  }
}

/**
 * wav2vec2 정렬을 쓸 수 없을 때(미지원 언어·로드 실패) 세그먼트 텍스트를 구간에
 * 균등 분배해 근사 단어 타임스탬프를 만든다. Whisper 재전사(이중 패스)를 하지 않아
 * 빠르며, CJK 토큰이 멀티바이트 경계에서 깨지던 문제도 없다.
 */
export function synthesizeSegmentWords(
  result: TranscriptResult,
  onProgress: ProgressFn
): TranscriptResult {
  for (const seg of result.segments) {
    seg.words = synthesizeWordsFromSegment(seg)
  }
  onProgress({ stage: 'align', pct: 100 })
  return result
}

function synthesizeWordsFromSegment(seg: Segment): Word[] {
  const tokens = seg.text.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []

  const duration = Math.max(0, seg.end - seg.start)
  return tokens.map((text, index) => {
    const start = seg.start + (duration * index) / tokens.length
    const end =
      index === tokens.length - 1 ? seg.end : seg.start + (duration * (index + 1)) / tokens.length
    return { text, start, end, score: 0 }
  })
}

async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  if (items.length === 0 || limit <= 0) return results
  let index = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currIndex = index++
      results[currIndex] = await fn(items[currIndex], currIndex)
    }
  })

  await Promise.all(workers)
  return results
}
