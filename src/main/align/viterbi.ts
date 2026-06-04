// CTC forced alignment (torchaudio 튜토리얼 알고리즘의 TypeScript 포팅).
// emission[t][c] = 프레임 t에서 토큰 c의 로그 확률(log-prob). blank 토큰 id는 기본 0.

/** 2차원 emission: frames × vocab, 값은 로그 확률 */
export interface Emission {
  logits: Float32Array
  rowLogSumExps: Float32Array
  frames: number
  vocabSize: number
}

/** 토큰 단위 정렬 구간 (프레임 인덱스 기준) */
export interface TokenSpan {
  /** tokens 배열에서의 위치 */
  tokenIndex: number
  /** vocab id */
  token: number
  /** 시작 프레임(포함) */
  startFrame: number
  /** 끝 프레임(미포함) */
  endFrame: number
  /** 평균 신뢰도 0..1 */
  score: number
}

const NEG_INF = -Infinity

/**
 * trellis 동적계획표 구성.
 * 1차원 Float32Array로 메모리를 일괄 할당하여 2차원 객체 배열 생성 오버헤드와 GC 부하를 제거합니다.
 * trellis[t * stride + j] = 프레임 t까지 사용해 tokens[0..j)를 정렬한 최적 누적 로그확률.
 */
function buildTrellis(emission: Emission, tokens: number[], blank: number): Float32Array {
  const numFrames = emission.frames
  const numTokens = tokens.length
  const stride = numTokens + 1
  const trellis = new Float32Array((numFrames + 1) * stride).fill(NEG_INF)
  trellis[0] = 0 // trellis[0 * stride + 0] = 0

  const logits = emission.logits
  const rowLogSumExps = emission.rowLogSumExps
  const vocabSize = emission.vocabSize

  for (let t = 0; t < numFrames; t++) {
    const currOffset = t * stride
    const nextOffset = (t + 1) * stride
    const rowOffset = t * vocabSize
    const logSumExp = rowLogSumExps[t]
    const blankLogProb = logits[rowOffset + blank] - logSumExp

    for (let j = 0; j <= numTokens; j++) {
      const prev = trellis[currOffset + j]
      if (prev === NEG_INF) continue

      // blank 유지(같은 토큰 위치)
      const stay = prev + blankLogProb
      if (stay > trellis[nextOffset + j]) {
        trellis[nextOffset + j] = stay
      }

      // 다음 토큰으로 전이
      if (j < numTokens) {
        const advance = prev + (logits[rowOffset + tokens[j]] - logSumExp)
        if (advance > trellis[nextOffset + j + 1]) {
          trellis[nextOffset + j + 1] = advance
        }
      }
    }
  }
  return trellis
}

/** trellis 역추적으로 각 프레임이 어떤 토큰에 속하는지 경로를 만든다. */
function backtrack(
  trellis: Float32Array,
  emission: Emission,
  tokens: number[],
  blank: number
): { frame: number; tokenIndex: number; isBlank: boolean; prob: number }[] {
  const numFrames = emission.frames
  const numTokens = tokens.length
  const stride = numTokens + 1
  const path: { frame: number; tokenIndex: number; isBlank: boolean; prob: number }[] = []

  let j = numTokens
  const logits = emission.logits
  const rowLogSumExps = emission.rowLogSumExps
  const vocabSize = emission.vocabSize

  for (let t = numFrames; t > 0; t--) {
    const currOffset = (t - 1) * stride
    const rowOffset = (t - 1) * vocabSize
    const logSumExp = rowLogSumExps[t - 1]

    const blankLogProb = logits[rowOffset + blank] - logSumExp
    const stayScore = trellis[currOffset + j] + blankLogProb

    let tokenLogProb = NEG_INF
    if (j > 0) {
      tokenLogProb = logits[rowOffset + tokens[j - 1]] - logSumExp
    }
    const advanceScore = j > 0 ? trellis[currOffset + j - 1] + tokenLogProb : NEG_INF
    const advanced = advanceScore > stayScore

    if (advanced) {
      path.push({
        frame: t - 1,
        tokenIndex: j - 1,
        isBlank: false,
        prob: Math.exp(tokenLogProb)
      })
      j -= 1
    } else {
      path.push({
        frame: t - 1,
        tokenIndex: j - 1,
        isBlank: true,
        prob: Math.exp(blankLogProb)
      })
    }
    if (j === 0) break
  }
  return path.reverse()
}

/**
 * emission과 토큰열을 받아 토큰별 프레임 구간을 산출한다.
 * blank 프레임은 직전 토큰에 흡수시켜 연속 구간을 만든다.
 */
export function forcedAlign(emission: Emission, tokens: number[], blank = 0): TokenSpan[] {
  if (emission.frames === 0 || tokens.length === 0) return []

  const trellis = buildTrellis(emission, tokens, blank)
  const path = backtrack(trellis, emission, tokens, blank)

  // CTC 정렬: 토큰 프레임(advance)은 새 구간을 시작하고,
  // 뒤따르는 blank(stay) 프레임은 직전 토큰 구간에 흡수시켜 끝 시점을 확장한다.
  // 선행 blank(아직 토큰 없음)는 버린다.
  const spans: TokenSpan[] = []
  // 토큰별 신뢰도 누적(blank 프레임은 신뢰도에 포함하지 않음)
  const tokenFrameCount: number[] = []
  for (const p of path) {
    const last = spans[spans.length - 1]
    if (p.isBlank) {
      if (last) last.endFrame = p.frame + 1
      continue
    }
    if (last && last.tokenIndex === p.tokenIndex) {
      last.endFrame = p.frame + 1
      last.score += p.prob
      tokenFrameCount[spans.length - 1] += 1
    } else {
      spans.push({
        tokenIndex: p.tokenIndex,
        token: tokens[p.tokenIndex],
        startFrame: p.frame,
        endFrame: p.frame + 1,
        score: p.prob
      })
      tokenFrameCount[spans.length - 1] = 1
    }
  }
  // 토큰 프레임 평균으로 신뢰도 정규화
  spans.forEach((s, i) => {
    const frames = tokenFrameCount[i]
    s.score = frames > 0 ? s.score / frames : 0
  })
  return spans
}
