import { describe, expect, it, vi } from 'vitest'
import { detectAlignLanguage, hasAlignModel, isAutoLanguage } from './manager'

vi.mock('electron', () => ({
  app: {
    getPath: () => 'test-user-data'
  }
}))

describe('hasAlignModel', () => {
  it('레지스트리에 있는 언어를 지원으로 판정한다', () => {
    expect(hasAlignModel('en')).toBe(true)
    expect(hasAlignModel('en-US')).toBe(true)
    expect(hasAlignModel('ko')).toBe(true)
    expect(hasAlignModel('ja')).toBe(true)
    expect(hasAlignModel('zh-CN')).toBe(true)
  })

  it('다국어-56 공유 모델로 추가된 언어들을 지원으로 판정한다', () => {
    for (const lang of ['nl', 'uk', 'cs', 'el', 'hu', 'fi', 'ro', 'ar', 'hi', 'id', 'th', 'vi']) {
      expect(hasAlignModel(lang)).toBe(true)
    }
    // 지역 변형(BCP-47)도 동일하게 판정
    expect(hasAlignModel('vi-VN')).toBe(true)
  })

  it('레지스트리에 없는 언어와 자동 언어는 폴백하지 않는다', () => {
    expect(hasAlignModel('xx')).toBe(false)
    expect(hasAlignModel('auto')).toBe(false)
    expect(hasAlignModel()).toBe(false)
  })
})

describe('isAutoLanguage', () => {
  it('빈 값과 auto를 자동으로 판정한다', () => {
    expect(isAutoLanguage()).toBe(true)
    expect(isAutoLanguage('')).toBe(true)
    expect(isAutoLanguage('auto')).toBe(true)
  })

  it('구체적 언어는 자동이 아니다', () => {
    expect(isAutoLanguage('ko')).toBe(false)
    expect(isAutoLanguage('en-US')).toBe(false)
  })
})

describe('detectAlignLanguage', () => {
  it('스크립트로 정렬 언어를 추정한다', () => {
    expect(detectAlignLanguage('안녕하세요 반갑습니다')).toBe('ko')
    expect(detectAlignLanguage('こんにちは 世界')).toBe('ja')
    expect(detectAlignLanguage('你好世界')).toBe('zh')
    expect(detectAlignLanguage('Привет мир')).toBe('ru')
    expect(detectAlignLanguage('नमस्ते दुनिया')).toBe('hi')
    expect(detectAlignLanguage('สวัสดี ชาวโลก')).toBe('th')
    expect(detectAlignLanguage('Γειά σου κόσμε')).toBe('el')
    expect(detectAlignLanguage('مرحبا بالعالم')).toBe('ar')
  })

  it('라틴 문자 등 특정 불가하면 undefined를 반환한다', () => {
    expect(detectAlignLanguage('Hello world')).toBeUndefined()
    expect(detectAlignLanguage('Bonjour le monde')).toBeUndefined()
  })
})
