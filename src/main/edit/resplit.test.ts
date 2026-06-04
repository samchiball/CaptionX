import type { Segment, Word } from '@shared/types'
import { describe, expect, it } from 'vitest'
import { resplitResult, resplitSegments } from './resplit'

/** [text, start, end] 튜플 배열로 단어를 만든다(score는 1). */
function words(spec: Array<[string, number, number]>): Word[] {
  return spec.map(([text, start, end]) => ({ text, start, end, score: 1 }))
}

function segment(ws: Word[]): Segment {
  return {
    start: ws[0].start,
    end: ws[ws.length - 1].end,
    text: ws.map((w) => w.text).join(' '),
    words: ws
  }
}

const texts = (segs: Segment[]): string[] => segs.map((s) => s.text)

describe('resplitSegments', () => {
  it('침묵이 있어도 조사/관형어가 다음 문맥에 의존하면 한 문장처럼 병합한다', () => {
    // 여기서 자체가 좀 재밌는 [침묵] 컨셉의 맛집이 아유가 [침묵] 굉장히 많아
    const seg = segment(
      words([
        ['여기서', 0.0, 0.4],
        ['자체가', 0.4, 0.7],
        ['좀', 0.7, 0.9],
        ['재밌는', 0.9, 1.4],
        ['컨셉의', 2.0, 2.4], // 0.6초 침묵
        ['맛집이', 2.4, 2.8],
        ['아유가', 2.8, 3.2],
        ['굉장히', 3.8, 4.2], // 0.6초 침묵
        ['많아', 4.2, 4.8]
      ])
    )
    const out = resplitSegments([seg], { maxChars: 20 })
    expect(texts(out)).toEqual(['여기서 자체가 좀 재밌는 컨셉의 맛집이 아유가 굉장히 많아'])
  })

  it('원래 분리된 세그먼트는 합치지 않고 개별 세그먼트 단독으로 유지한다', () => {
    const segs: Segment[] = [
      { start: 0.443, end: 1.046, text: '이러다가 이', words: [] },
      { start: 1.409, end: 2.596, text: '카테고리 자체가 재밌는', words: [] },
      { start: 2.636, end: 3.502, text: '것들 나오잖아 이거', words: [] },
      { start: 3.644, end: 4.149, text: '위는', words: [] },
      { start: 4.714, end: 5.743, text: '좀 어렵긴 약간 이런', words: [] },
      { start: 5.783, end: 6.889, text: '것들은 뭐 3일절', words: [] },
      { start: 6.97, end: 7.594, text: '기념해가지고', words: [] },
      { start: 7.614, end: 9.447, text: '맞추기하면은 나락방어정', words: [] }
    ]

    const out = resplitSegments(segs, { maxChars: 16 })

    expect(texts(out)).toEqual([
      '이러다가 이',
      '카테고리 자체가 재밌는',
      '것들 나오잖아 이거',
      '위는',
      '좀 어렵긴 약간 이런',
      '것들은 뭐 3일절',
      '기념해가지고',
      '맞추기하면은 나락방어정'
    ])
  })

  it('영어 전치사/관사/접속사 뒤의 어색한 단독 분리를 피한다', () => {
    const seg = segment(
      words([
        ['This', 0.0, 0.2],
        ['is', 0.2, 0.4],
        ['the', 0.4, 0.6],
        ['story', 0.95, 1.2],
        ['of', 1.2, 1.35],
        ['a', 1.35, 1.45],
        ['small', 1.8, 2.0],
        ['team', 2.0, 2.3],
        ['that', 2.65, 2.85],
        ['kept', 2.85, 3.05],
        ['building', 3.05, 3.4]
      ])
    )

    const out = resplitSegments([seg], { maxChars: 14, language: 'en' })

    expect(texts(out)).toEqual(['This is the story', 'of a small team', 'that kept building'])
    expect(texts(out)).not.toContain('This is the')
    expect(texts(out)).not.toContain('of a')
  })

  it('일본어 조사 뒤를 짧은 침묵만으로 자르지 않는다', () => {
    const seg = segment(
      words([
        ['これは', 0.0, 0.4],
        ['新しい', 0.8, 1.2],
        ['字幕の', 1.2, 1.5],
        ['編集です', 1.9, 2.4],
        ['でも', 2.85, 3.1],
        ['自然に', 3.1, 3.5],
        ['分けます', 3.95, 4.4]
      ])
    )

    const out = resplitSegments([seg], { maxChars: 10, language: 'ja' })

    expect(texts(out)).toEqual(['これは新しい字幕の編集です', 'でも自然に分けます'])
    expect(texts(out)).not.toContain('これは')
    expect(texts(out)).not.toContain('字幕の')
  })

  it('중국어 구조조사/어기조사를 이웃 문맥과 함께 유지한다', () => {
    const seg = segment(
      words([
        ['这是', 0.0, 0.3],
        ['一个', 0.3, 0.55],
        ['很', 0.9, 1.05],
        ['自然的', 1.05, 1.45],
        ['字幕', 1.85, 2.15],
        ['分割', 2.15, 2.45],
        ['方式', 2.9, 3.2],
        ['吧', 3.2, 3.3]
      ])
    )

    const out = resplitSegments([seg], { maxChars: 8, language: 'zh' })

    expect(texts(out)).toEqual(['这是一个很自然的字幕', '分割方式吧'])
    expect(texts(out)).not.toContain('这是 一个')
    expect(texts(out)).not.toContain('方式')
  })

  it('공백 없는 일본어 텍스트는 Intl.Segmenter로 단어 후보를 만든다', () => {
    const seg: Segment = { start: 0, end: 4, text: 'これは新しい字幕編集です', words: [] }

    const out = resplitSegments([seg], { maxChars: 10, language: 'ja' })

    expect(out[0].words.length).toBeGreaterThan(1)
    expect(texts(out).join(' ')).toContain('字幕')
  })

  it('재분할된 세그먼트의 start/end 가 단어 경계를 따른다', () => {
    const seg = segment(
      words([
        ['a', 0.0, 0.4],
        ['b', 0.4, 0.8],
        ['c', 1.5, 2.0] // 침묵
      ])
    )
    const out = resplitSegments([seg], { maxChars: 20 })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ start: 0.0, end: 0.8 })
    expect(out[1]).toMatchObject({ start: 1.5, end: 2.0 })
  })

  it('침묵이 거의 없으면 글자 수 상한에서 끊는다', () => {
    // 각 단어 'wN'은 2글자. maxChars 8 → 문맥 한도 16자 안에서 최대한 묶는다.
    const spec: Array<[string, number, number]> = []
    for (let i = 0; i < 7; i++) spec.push([`w${i}`, i * 0.3, i * 0.3 + 0.3])
    const out = resplitSegments([segment(words(spec))], { maxChars: 8 })
    expect(out.map((s) => s.words.length)).toEqual([5, 2])
    expect(out.every((s) => [...s.text].length <= 16)).toBe(true)
  })

  it('문맥을 위해 권장 길이는 넘을 수 있지만 문맥 한도 안에서 끊는다', () => {
    const spec: Array<[string, number, number]> = []
    for (let i = 0; i < 30; i++) spec.push([`단어${i}`, i * 0.2, i * 0.2 + 0.2])
    const out = resplitSegments([segment(words(spec))], { maxChars: 12 })
    expect(out.some((s) => [...s.text].length > 12)).toBe(true)
    expect(out.every((s) => [...s.text].length <= 24)).toBe(true)
  })

  it('문장부호로 끝나는 단어 다음에서 끊는다', () => {
    const seg = segment(
      words([
        ['hello.', 0.0, 0.4],
        ['world', 0.4, 0.8]
      ])
    )
    const out = resplitSegments([seg], { maxChars: 20 })
    expect(texts(out)).toEqual(['hello.', 'world'])
  })

  it('세그먼트 경계를 넘어 침묵이 작아도 원래 분리된 세그먼트는 병합하지 않는다', () => {
    const segA = segment(
      words([
        ['one', 0.0, 0.4],
        ['two', 0.4, 0.8]
      ])
    )
    const segB = segment(
      words([
        ['three', 0.85, 1.2], // 0.05초 간격
        ['four', 1.2, 1.6]
      ])
    )
    const out = resplitSegments([segA, segB], { maxChars: 20 })
    expect(texts(out)).toEqual(['one two', 'three four'])
  })

  it('긴 세그먼트가 문맥 한도를 초과하면 자연스러운 단어 경계에서 쪼갠다', () => {
    const seg = segment(
      words([
        ['이것은', 0.0, 0.3],
        ['아주', 0.3, 0.6],
        ['긴', 0.6, 0.9],
        ['한국어', 0.9, 1.2],
        ['문장이며', 1.2, 1.5],
        ['여러', 1.5, 1.8],
        ['개의', 1.8, 2.1],
        ['단어로', 2.1, 2.4],
        ['구성되어', 2.4, 2.7],
        ['있습니다.', 2.7, 3.0]
      ])
    )
    const out = resplitSegments([seg], { maxChars: 15 })
    expect(texts(out)).toEqual([
      '이것은 아주 긴 한국어 문장이며 여러',
      '개의 단어로 구성되어 있습니다.'
    ])
  })

  it('단어가 없는 세그먼트는 텍스트를 토큰화해 처리한다', () => {
    const seg: Segment = { start: 0, end: 4, text: '하나 둘 셋 넷', words: [] }
    const out = resplitSegments([seg], { maxChars: 4 })
    expect(out.map((s) => s.words.length)).toEqual([4])
    expect(texts(out)).toEqual(['하나 둘 셋 넷'])
  })

  it('내용이 전혀 없으면 원본을 그대로 반환한다', () => {
    const segs: Segment[] = [{ start: 0, end: 1, text: '', words: [] }]
    expect(resplitSegments(segs, { maxChars: 12 })).toBe(segs)
  })
})

describe('resplitResult', () => {
  it('언어를 보존하고 세그먼트만 재분할한다', () => {
    const seg = segment(
      words([
        ['a', 0.0, 0.4],
        ['b', 2.0, 2.4] // 침묵
      ])
    )
    const out = resplitResult({ language: 'ko', segments: [seg] }, { maxChars: 20 })
    expect(out.language).toBe('ko')
    expect(out.segments).toHaveLength(2)
  })
})
