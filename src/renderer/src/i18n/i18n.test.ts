import { describe, expect, it } from 'vitest'
import { interpolate } from './format'
import { translations, UI_LOCALES } from './translations'

describe('interpolate', () => {
  it('치환할 params 가 없으면 원형을 그대로 돌려준다', () => {
    expect(interpolate('자막 보기')).toBe('자막 보기')
  })

  it('{name} 자리표시자를 params 값으로 바꾼다', () => {
    expect(interpolate('전사 시작 ({n})', { n: 3 })).toBe('전사 시작 (3)')
  })

  it('여러 자리표시자를 모두 치환한다', () => {
    expect(interpolate('배치 {batch} / 한도 {max}', { batch: 5, max: 2 })).toBe('배치 5 / 한도 2')
  })

  it('params 에 없는 자리표시자는 원형을 유지한다', () => {
    expect(interpolate('{a}-{b}', { a: 'x' })).toBe('x-{b}')
  })
})

describe('translations', () => {
  const koKeys = Object.keys(translations.ko).sort()

  it('모든 UI 언어가 ko 와 동일한 키 집합을 갖는다', () => {
    for (const locale of UI_LOCALES) {
      expect(Object.keys(translations[locale]).sort()).toEqual(koKeys)
    }
  })

  it('빈 번역 값이 없다', () => {
    for (const locale of UI_LOCALES) {
      for (const [key, value] of Object.entries(translations[locale])) {
        expect(value, `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('번역 값의 자리표시자 집합이 언어마다 일치한다', () => {
    const placeholders = (s: string): string[] => (s.match(/\{(\w+)\}/g) ?? []).sort()
    for (const key of koKeys) {
      const expected = placeholders(translations.ko[key as keyof typeof translations.ko])
      for (const locale of UI_LOCALES) {
        expect(placeholders(translations[locale][key as keyof typeof translations.ko])).toEqual(
          expected
        )
      }
    }
  })
})
