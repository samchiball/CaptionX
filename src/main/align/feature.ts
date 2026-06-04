// wav2vec2 입력 특징 전처리.
// HuggingFace Wav2Vec2FeatureExtractor의 do_normalize 동작(zero-mean / unit-variance)을
// preprocessor_config.json 설정에 따라 재현한다. Python 의존 없이 순수 함수로 구현한다.

/**
 * preprocessor_config.json 원문에서 do_normalize를 읽는다.
 * 누락/파싱 실패 시 true를 기본으로 한다(xlsr 계열이 다수이며 정규화가 안전한 기본값).
 * 영어 base-960h 등은 설정에 false가 명시되어 자동 반영된다.
 */
export function parseDoNormalize(raw: string): boolean {
  try {
    const json = JSON.parse(raw) as { do_normalize?: unknown }
    if (typeof json.do_normalize === 'boolean') return json.do_normalize
  } catch {
    // 무시하고 기본값 사용
  }
  return true
}

/**
 * per-utterance zero-mean unit-variance 정규화.
 * HF zero_mean_unit_var_norm과 동일: (x - mean) / sqrt(var + 1e-7).
 * 빈 입력/상수 입력에도 NaN 없이 동작한다.
 */
export function normalizePcm(pcm: Float32Array): Float32Array {
  const n = pcm.length
  if (n === 0) return pcm
  let mean = 0
  for (let i = 0; i < n; i++) mean += pcm[i]
  mean /= n
  let variance = 0
  for (let i = 0; i < n; i++) {
    const d = pcm[i] - mean
    variance += d * d
  }
  variance /= n
  const inv = 1 / Math.sqrt(variance + 1e-7)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = (pcm[i] - mean) * inv
  return out
}
