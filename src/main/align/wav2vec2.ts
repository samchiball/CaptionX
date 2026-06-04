import os from 'node:os'
import type * as ort from 'onnxruntime-node'
import { normalizePcm } from './feature'
import type { Vocab } from './tokenizer'
import type { Emission } from './viterbi'

export interface AlignModel {
  session: ort.InferenceSession
  vocab: Vocab
  /** CTC blank(pad) 토큰 id */
  blank: number
  /** feature extractor의 do_normalize (per-utterance zero-mean / unit-variance) */
  normalize: boolean
}

/**
 * GPU 우선, 실패 시 CPU로 폴백하는 실행 공급자 목록.
 * onnxruntime-node 기본 빌드가 지원하는 EP만 사용한다(미지원 EP는 네이티브 크래시 위험).
 * - Windows: DirectML(dml) → CPU
 * - Linux: CUDA → CPU
 * - macOS: CoreML → CPU
 */
export function executionProviders(gpu: boolean): string[] {
  if (!gpu) return ['cpu']
  if (process.platform === 'darwin') return ['coreml', 'cpu']
  if (process.platform === 'win32') return ['dml', 'cpu']
  return ['cuda', 'cpu']
}

let ortPromise: Promise<typeof import('onnxruntime-node')> | null = null
export function getOrtRuntime(): Promise<typeof import('onnxruntime-node')> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-node')
  }
  return ortPromise
}

/** CPU 추론에 쓸 intraOp 스레드 수(코어 절반, 1~4로 클램프). */
function cpuIntraOpThreads(): number {
  return Math.max(1, Math.min(4, os.cpus().length / 2))
}

/**
 * ONNX 세션을 생성한다. GPU EP를 우선 시도하고, GPU EP 등록/세션 생성이 실패하면
 * CPU EP로 폴백한다.
 *
 * onnxruntime-node 기본 빌드가 지원하지 않는 EP(예: CUDA 런타임이 없는 Linux,
 * 미지원 플랫폼)는 세션 생성 단계에서 throw하거나 네이티브 크래시 위험이 있으므로,
 * EP 리스트에 'cpu'를 함께 넘기는 것만으로는 안전하지 않다. 명시적으로 CPU 세션을
 * 다시 만들어 안전하게 폴백한다. 모든 정렬/향상 세션 생성이 이 경로를 공유한다.
 */
export async function createOrtSession(
  onnxPath: string,
  gpu: boolean,
  extraOptions: ort.InferenceSession.SessionOptions = {}
): Promise<ort.InferenceSession> {
  const ortRuntime = await getOrtRuntime()
  const baseOptions: ort.InferenceSession.SessionOptions = {
    graphOptimizationLevel: 'all',
    ...extraOptions
  }
  const gpuOptions: ort.InferenceSession.SessionOptions = {
    ...baseOptions,
    executionProviders: executionProviders(gpu) as ort.InferenceSession.ExecutionProviderConfig[]
  }
  if (!gpu) {
    gpuOptions.intraOpNumThreads = cpuIntraOpThreads()
    return ortRuntime.InferenceSession.create(onnxPath, gpuOptions)
  }

  try {
    return await ortRuntime.InferenceSession.create(onnxPath, gpuOptions)
  } catch (err) {
    console.error('GPU ONNX 세션 생성 실패, CPU로 폴백합니다:', (err as Error).message)
    return ortRuntime.InferenceSession.create(onnxPath, {
      ...baseOptions,
      executionProviders: ['cpu'],
      intraOpNumThreads: cpuIntraOpThreads()
    })
  }
}

/**
 * PCM(16kHz mono)을 wav2vec2 CTC에 통과시켜 emission(frames × vocab 로그확률)을 만든다.
 * electron 등 외부 의존 없이 onnxruntime 세션만 사용한다(테스트 용이).
 * @param normalize 모델의 do_normalize. true면 입력을 zero-mean/unit-variance로 정규화한다.
 */
export async function computeEmission(
  session: ort.InferenceSession,
  pcm: Float32Array,
  normalize = false
): Promise<Emission> {
  const values = normalize ? normalizePcm(pcm) : pcm
  // onnxruntime-node를 지연 로드한다. 일부 플랫폼(예: Intel Mac)은 prebuilt 바이너리가
  // 없어 require 시 throw하므로, 정적 import면 정렬을 안 써도 앱 부팅이 깨진다.
  const ortRuntime = await getOrtRuntime()
  const input = new ortRuntime.Tensor('float32', values, [1, values.length])
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]
  const feeds: Record<string, ort.Tensor> = { [inputName]: input }
  const results = await session.run(feeds)
  const logits = results[outputName]
  // logits shape: [1, frames, vocab]
  const [, frames, vocabSize] = logits.dims as [number, number, number]
  const data = logits.data as Float32Array

  const rowLogSumExps = new Float32Array(frames)
  for (let t = 0; t < frames; t++) {
    const offset = t * vocabSize
    let max = -Infinity
    for (let c = 0; c < vocabSize; c++) {
      const val = data[offset + c]
      if (val > max) max = val
    }
    let sumExp = 0
    for (let c = 0; c < vocabSize; c++) {
      sumExp += Math.exp(data[offset + c] - max)
    }
    rowLogSumExps[t] = max + Math.log(sumExp)
  }

  return {
    logits: data,
    rowLogSumExps,
    frames,
    vocabSize
  }
}
