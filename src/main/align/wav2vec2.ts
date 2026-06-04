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
 * - Windows/Linux: CUDA(있을 때) → CPU
 * - macOS: CoreML → CPU
 * DirectML('dml')은 node 기본 빌드에 없으므로 제외한다.
 */
export function executionProviders(gpu: boolean): string[] {
  if (!gpu) return ['cpu']
  if (process.platform === 'darwin') return ['coreml', 'cpu']
  return ['cuda', 'cpu']
}

let ortPromise: Promise<typeof import('onnxruntime-node')> | null = null
export function getOrtRuntime(): Promise<typeof import('onnxruntime-node')> {
  if (!ortPromise) {
    ortPromise = import('onnxruntime-node')
  }
  return ortPromise
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
