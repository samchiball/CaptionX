import { describe, expect, it } from 'vitest'
import { filterLanguageOptions, resolveLanguageInput } from './languages'

describe('language options', () => {
  it('언어 코드와 표시 이름으로 검색한다', () => {
    expect(filterLanguageOptions('ko').map((option) => option.code)).toContain('ko')
    expect(filterLanguageOptions('한국').map((option) => option.code)).toEqual(['ko'])
    expect(filterLanguageOptions('English').map((option) => option.code)).toContain('en')
  })

  it('선택 표시값을 파이프라인 언어 코드로 정규화한다', () => {
    expect(resolveLanguageInput('자동 감지')).toBe('')
    expect(resolveLanguageInput('auto')).toBe('')
    expect(resolveLanguageInput('한국어 (ko)')).toBe('ko')
    expect(resolveLanguageInput('Korean')).toBe('ko')
    expect(resolveLanguageInput(' en ')).toBe('en')
  })
})
