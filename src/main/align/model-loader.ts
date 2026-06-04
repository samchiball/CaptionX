import { readFile } from 'node:fs/promises'
import os from 'node:os'
import type * as ort from 'onnxruntime-node'
import { type DownloadProgress, ensureAlignModel } from '../models/manager'
import { parseDoNormalize } from './feature'
import { parseVocab } from './vocab'
import { type AlignModel, executionProviders, getOrtRuntime } from './wav2vec2'

/**
 * 모델 파일 경로별 캐시. 여러 언어가 같은 정렬 모델(예: 다국어-56)을 공유하면
 * 같은 onnxPath로 해석되므로, 1.2GB 세션을 언어 수만큼 중복 로드하지 않는다.
 * GPU/CPU 세션은 서로 다르므로 gpu 플래그도 키에 포함한다.
 */
const cache = new Map<string, AlignModel>()

/**
 * wav2vec2 정렬 모델/세션을 로드(캐시)한다. 모델이 없으면 자동 다운로드한다.
 */
export async function loadAlignModel(
  gpu: boolean,
  alignMode: 'wav2vec2' | 'mms',
  language?: string,
  onModelProgress?: (p: DownloadProgress) => void
): Promise<AlignModel> {
  const { onnxPath, vocabPath, featurePath } = await ensureAlignModel(
    alignMode,
    language,
    onModelProgress
  )
  const cacheKey = `${gpu ? 'gpu' : 'cpu'}:${onnxPath}`
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const { vocab, blank } = parseVocab(await readFile(vocabPath, 'utf-8'))
  const normalize = featurePath ? parseDoNormalize(await readFile(featurePath, 'utf-8')) : true

  const session = await createSession(onnxPath, gpu)
  const model: AlignModel = { session, vocab, blank, normalize }
  cache.set(cacheKey, model)
  return model
}

/** GPU EP로 세션 생성을 시도하고, 실패하면 CPU로 폴백한다. */
async function createSession(onnxPath: string, gpu: boolean): Promise<ort.InferenceSession> {
  // onnxruntime-node는 prebuilt 바이너리가 없는 플랫폼(예: Intel Mac)에서 require 시
  // throw하므로 지연 로드한다. 정렬이 필요할 때만 로드해 앱 부팅을 보호한다.
  const ortRuntime = await getOrtRuntime()
  const intraOpThreads = gpu ? undefined : Math.max(1, Math.min(4, os.cpus().length / 2))
  try {
    return await ortRuntime.InferenceSession.create(onnxPath, {
      executionProviders: executionProviders(gpu) as ort.InferenceSession.ExecutionProviderConfig[],
      intraOpNumThreads: intraOpThreads,
      graphOptimizationLevel: 'all'
    })
  } catch (err) {
    if (!gpu) throw err
    console.error('GPU 정렬 세션 생성 실패, CPU로 폴백합니다:', (err as Error).message)
    const cpuIntraOpThreads = Math.max(1, Math.min(4, os.cpus().length / 2))
    return ortRuntime.InferenceSession.create(onnxPath, {
      executionProviders: ['cpu'],
      intraOpNumThreads: cpuIntraOpThreads,
      graphOptimizationLevel: 'all'
    })
  }
}
