import { readFile } from 'node:fs/promises'
import { type DownloadProgress, ensureAlignModel } from '../models/manager'
import { parseDoNormalize } from './feature'
import { parseVocab } from './vocab'
import { type AlignModel, createOrtSession } from './wav2vec2'

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

  // onnxruntime-node는 prebuilt 바이너리가 없는 플랫폼(예: Intel Mac)에서 require 시
  // throw하므로 createOrtSession이 ort를 지연 로드한다. GPU EP 실패 시 CPU로 폴백한다.
  const session = await createOrtSession(onnxPath, gpu)
  const model: AlignModel = { session, vocab, blank, normalize }
  cache.set(cacheKey, model)
  return model
}
