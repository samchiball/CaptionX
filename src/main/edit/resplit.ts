import type { ResplitOptions, Segment, TranscriptResult, Word } from '@shared/types'

const DEFAULT_MIN_PAUSE = 0.3
const DEFAULT_GAP_FACTOR = 1.6
const DEFAULT_CONTEXT_FACTOR = 2
const DEFAULT_CONTEXT_CAP = 72

type SegmenterGranularity = 'grapheme' | 'word' | 'sentence'

interface IntlSegment {
  segment: string
  index: number
  input: string
  isWordLike?: boolean
}

interface IntlSegmenterLike {
  segment(text: string): Iterable<IntlSegment>
}

interface IntlWithSegmenter {
  Segmenter?: new (
    locale?: string | string[],
    options?: { granularity?: SegmenterGranularity }
  ) => IntlSegmenterLike
}

/** 절/문장을 끝내는 문장부호(한국어·영어·중화권 공통). 단어 끝에 오면 자연 경계로 본다. */
const SENTENCE_END = /[.!?。！？…,，、]$/u
const HANGUL = /[가-힣]/u
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u
const CHINESE = /\p{Script=Han}/u
const DEPENDENT_END =
  /(이|가|은|는|을|를|의|에|와|과|도|만|로|으로|에게|한테|께|부터|까지|보다|처럼|같은|있는|없는|이런|그런|저런|어떤|무슨)$/u
const DEPENDENT_START =
  /^(이|그|저|이런|그런|저런|어떤|무슨|것|것들|거|건|걸|게|수|줄|듯|뿐|데|때|정도|만큼|자체|자체가|같은|좀|약간)$/u
const ENGLISH_DEPENDENT_END = new Set([
  'a',
  'an',
  'the',
  'of',
  'to',
  'for',
  'from',
  'with',
  'without',
  'in',
  'on',
  'at',
  'by',
  'as',
  'and',
  'or',
  'but',
  'because',
  'that',
  'which',
  'who',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'will',
  'would',
  'can',
  'could',
  'should',
  'may',
  'might'
])
const ENGLISH_DEPENDENT_START = new Set(['of', 'to', 'for', 'with', 'that', 'which', 'who'])
const JAPANESE_DEPENDENT_END =
  /(は|が|を|に|へ|で|と|も|の|や|から|まで|より|だけ|しか|こそ|でも|에는|では|とは|ので|なら|な|たる)$/u
const JAPANESE_DEPENDENT_START =
  /^(です|ます|する|した|して|いる|ある|ない|もの|こと|ため|よう|ので|から)$/u
const CHINESE_DEPENDENT_END = /(的|得|地|把|被|在|和|跟|与|向|给|对|为|一个|这|那|很)$/u
const CHINESE_DEPENDENT_START = /^(的|了|着|过|吗|呢|吧|啊|呀|么|很)$/u

function normalizeLanguage(language?: string): string {
  return language?.toLowerCase().split(/[-_]/)[0] ?? ''
}

function inferLanguage(text: string, explicit?: string): string {
  const language = normalizeLanguage(explicit)
  if (language) return language
  if (HANGUL.test(text)) return 'ko'
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja'
  if (CHINESE.test(text)) return 'zh'
  return 'en'
}

function intlSegmenter(
  locale: string,
  granularity: SegmenterGranularity
): IntlSegmenterLike | null {
  const Segmenter = (Intl as IntlWithSegmenter).Segmenter
  return Segmenter ? new Segmenter(locale || undefined, { granularity }) : null
}

function segmentTextByWord(text: string, language: string): string[] {
  const segmenter = intlSegmenter(language, 'word')
  if (!segmenter) return []
  const tokens = [...segmenter.segment(text)]
    .filter((part) => part.isWordLike !== false && part.segment.trim().length > 0)
    .map((part) => part.segment.trim())
  return tokens.length > 1 ? tokens : []
}

function tokenizeSegmentText(text: string, language: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const whitespaceTokens = trimmed.split(/\s+/).filter(Boolean)
  if (whitespaceTokens.length > 1) return whitespaceTokens
  const segmentedTokens = segmentTextByWord(trimmed, language)
  return segmentedTokens.length > 0 ? segmentedTokens : whitespaceTokens
}

function isCompactLanguage(language: string): boolean {
  return language === 'ja' || language === 'zh' || language === 'zh-cn' || language === 'zh-tw'
}

/**
 * 세그먼트의 단어 타임스탬프를 보장한다.
 * 정렬 결과가 없는(텍스트만 있는) 세그먼트는 텍스트를 공백으로 토큰화해
 * 세그먼트 구간에 균등 배치한 가상 단어를 만든다(타이밍은 근사).
 */
function ensureWords(seg: Segment, language: string): Word[] {
  if (seg.words.length > 0) return seg.words.filter((w) => w.text.trim().length > 0)
  const tokens = tokenizeSegmentText(seg.text, language)
  if (tokens.length === 0) return []
  const duration = Math.max(0, seg.end - seg.start)
  return tokens.map((text, i) => ({
    text,
    start: seg.start + (duration * i) / tokens.length,
    end: i === tokens.length - 1 ? seg.end : seg.start + (duration * (i + 1)) / tokens.length,
    score: 0
  }))
}

/**
 * 인접 단어 사이의 침묵 간격(초) 배열. gaps[i] 는 words[i] 와 words[i+1] 사이.
 * 음수(겹침)는 0으로 클램프한다.
 */
function gapsOf(words: Word[]): number[] {
  const gaps: number[] = []
  for (let i = 0; i < words.length - 1; i++) {
    gaps.push(Math.max(0, words[i + 1].start - words[i].end))
  }
  return gaps
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * 자연 경계로 인정할 침묵 임계값(초). 절대 하한(minPause)과, 표본이 충분할 때의
 * 중앙값 기반 상대값 중 큰 쪽. 중앙값을 쓰면 한두 개의 큰 침묵에 임계값이
 * 끌려 올라가 영영 끊기지 않는 문제를 피한다. 느린 발화(모든 간격이 큼)에서는
 * 상대값이 올라가 단어마다 끊기는 과분할을 막는다.
 */
function pauseThreshold(gaps: number[], minPause: number, gapFactor: number): number {
  if (gaps.length < 4) return minPause
  return Math.max(minPause, median(gaps) * gapFactor)
}

function contextualCharLimit(maxChars: number): number {
  return Math.max(
    maxChars,
    Math.min(DEFAULT_CONTEXT_CAP, Math.ceil(maxChars * DEFAULT_CONTEXT_FACTOR))
  )
}

function cleanEdgeText(text: string): string {
  return text.trim().replace(/^[("'“‘]+|[)"'”’]+$/gu, '')
}

function isKoreanDependentEnd(text: string): boolean {
  const edge = cleanEdgeText(text)
  return HANGUL.test(edge) && !SENTENCE_END.test(edge) && DEPENDENT_END.test(edge)
}

function isKoreanDependentStart(text: string): boolean {
  const edge = cleanEdgeText(text)
  return HANGUL.test(edge) && DEPENDENT_START.test(edge)
}

function isEnglishDependentEnd(text: string): boolean {
  return ENGLISH_DEPENDENT_END.has(cleanEdgeText(text).toLowerCase())
}

function isEnglishDependentStart(text: string): boolean {
  return ENGLISH_DEPENDENT_START.has(cleanEdgeText(text).toLowerCase())
}

function isJapaneseDependentEnd(text: string): boolean {
  const edge = cleanEdgeText(text)
  return JAPANESE.test(edge) && JAPANESE_DEPENDENT_END.test(edge)
}

function isJapaneseDependentStart(text: string): boolean {
  const edge = cleanEdgeText(text)
  return JAPANESE.test(edge) && JAPANESE_DEPENDENT_START.test(edge)
}

function isChineseDependentEnd(text: string): boolean {
  const edge = cleanEdgeText(text)
  return CHINESE.test(edge) && CHINESE_DEPENDENT_END.test(edge)
}

function isChineseDependentStart(text: string): boolean {
  const edge = cleanEdgeText(text)
  return CHINESE.test(edge) && CHINESE_DEPENDENT_START.test(edge)
}

function shouldAvoidBreak(left: Word, right: Word, language: string): boolean {
  if (language === 'ko')
    return isKoreanDependentEnd(left.text) || isKoreanDependentStart(right.text)
  if (language === 'ja')
    return isJapaneseDependentEnd(left.text) || isJapaneseDependentStart(right.text)
  if (language === 'zh')
    return isChineseDependentEnd(left.text) || isChineseDependentStart(right.text)
  return isEnglishDependentEnd(left.text) || isEnglishDependentStart(right.text)
}

/** words[i] 다음에서 끊는 것이 자연스러운가(문장부호 또는 충분한 침묵). */
function isNaturalBreak(
  words: Word[],
  i: number,
  gaps: number[],
  threshold: number,
  language: string
): boolean {
  if (SENTENCE_END.test(cleanEdgeText(words[i].text))) return true
  return gaps[i] >= threshold && !shouldAvoidBreak(words[i], words[i + 1], language)
}

function findFallbackBreak(words: Word[], language: string): number {
  for (let i = words.length - 2; i >= 0; i--) {
    if (!shouldAvoidBreak(words[i], words[i + 1], language)) return i
  }
  return -1
}

function joinWords(words: Word[], language: string): string {
  return words.map((w) => w.text).join(isCompactLanguage(language) ? '' : ' ')
}

function chunkToSegment(words: Word[], language: string): Segment {
  return {
    start: words[0].start,
    end: words[words.length - 1].end,
    text: joinWords(words, language),
    words
  }
}

/** 한 줄(단어들을 공백으로 이은 텍스트)의 글자 수. */
function lineLength(words: Word[], language: string): number {
  return [...joinWords(words, language)].length
}

/** 단일 세그먼트를 권장 글자 수 및 자연스러운 문맥 경계에 맞게 분할한다. */
function splitSingleSegment(
  seg: Segment,
  maxChars: number,
  minPause: number,
  gapFactor: number,
  language: string
): Segment[] {
  const words = ensureWords(seg, language)
  if (words.length === 0) return [seg]

  const gaps = gapsOf(words)
  const threshold = pauseThreshold(gaps, minPause, gapFactor)
  const contextLimit = contextualCharLimit(maxChars)

  const chunks: Word[][] = []
  let current: Word[] = []
  let hasDeferredPause = false
  for (let i = 0; i < words.length; i++) {
    if (current.length > 0 && lineLength([...current, words[i]], language) > contextLimit) {
      if (!shouldAvoidBreak(current[current.length - 1], words[i], language)) {
        chunks.push(current)
        current = []
        hasDeferredPause = false
      } else {
        const fallback = findFallbackBreak(current, language)
        if (fallback >= 0) {
          chunks.push(current.slice(0, fallback + 1))
          current = current.slice(fallback + 1)
          hasDeferredPause = false
        } else {
          chunks.push(current)
          current = []
          hasDeferredPause = false
        }
      }
    }
    current.push(words[i])

    const isLast = i === words.length - 1
    if (isLast) {
      chunks.push(current)
      break
    }
    if (language !== 'ko' && hasDeferredPause && lineLength(current, language) > maxChars) {
      chunks.push(current)
      current = []
      hasDeferredPause = false
      continue
    }
    if (
      isNaturalBreak(words, i, gaps, threshold, language) ||
      (isCompactLanguage(language) &&
        gaps[i] >= minPause &&
        lineLength(current, language) > maxChars &&
        !shouldAvoidBreak(words[i], words[i + 1], language))
    ) {
      if (isCompactLanguage(language) && lineLength(current, language) <= maxChars) {
        continue
      }
      chunks.push(current)
      current = []
      hasDeferredPause = false
      continue
    }
    if (gaps[i] >= threshold && shouldAvoidBreak(words[i], words[i + 1], language)) {
      hasDeferredPause = true
    }
  }

  return chunks.map((chunk) => chunkToSegment(chunk, language))
}

/**
 * 단어 타임스탬프를 기준으로 자막을 다시 분할한다.
 * 원래 분리된 세그먼트의 경계는 그대로 유지하며, 각 세그먼트별로 글자 수가 maxChars를
 * 초과하는 경우에만 유연하게 자연스러운 경계(침묵, 문장부호, 조사 등)를 골라 분할한다.
 */
export function resplitSegments(segments: Segment[], options: ResplitOptions): Segment[] {
  if (segments.length === 0 || segments.every((seg) => !seg.text.trim())) {
    return segments
  }

  const maxChars = Math.max(1, Math.floor(options.maxChars))
  const minPause = options.minPause ?? DEFAULT_MIN_PAUSE
  const gapFactor = options.gapFactor ?? DEFAULT_GAP_FACTOR

  const result: Segment[] = []
  for (const seg of segments) {
    if (!seg.text.trim()) {
      result.push(seg)
      continue
    }
    const language = inferLanguage(seg.text, options.language)
    const split = splitSingleSegment(seg, maxChars, minPause, gapFactor, language)
    result.push(...split)
  }
  return result
}

/** 전사 결과 전체를 재분할한 새 결과를 반환한다(언어는 보존). */
export function resplitResult(result: TranscriptResult, options: ResplitOptions): TranscriptResult {
  return {
    language: result.language,
    segments: resplitSegments(result.segments, {
      ...options,
      language: options.language ?? result.language
    })
  }
}
