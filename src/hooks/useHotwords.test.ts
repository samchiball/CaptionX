import { describe, expect, it } from 'vitest'
import { addHotword, parseHotwordText } from './useHotwords'

describe('addHotword', () => {
  it('트림한 단어를 목록 끝에 추가한다', () => {
    expect(addHotword(['CaptionX'], '  wav2vec2 ')).toEqual(['CaptionX', 'wav2vec2'])
  })

  it('이미 있는 단어(대소문자 구분)는 추가하지 않는다', () => {
    expect(addHotword(['CaptionX'], 'CaptionX')).toEqual(['CaptionX'])
    expect(addHotword(['CaptionX'], 'captionX')).toEqual(['CaptionX', 'captionX'])
  })

  it('빈 입력은 무시한다', () => {
    expect(addHotword(['CaptionX'], '   ')).toEqual(['CaptionX'])
    expect(addHotword(['CaptionX'], '')).toEqual(['CaptionX'])
  })
})

describe('parseHotwordText', () => {
  it('쉼표·줄바꿈으로 나눠 트림하고 중복을 제거한다', () => {
    expect(parseHotwordText('CaptionX, wav2vec2\nONNX, CaptionX')).toEqual([
      'CaptionX',
      'wav2vec2',
      'ONNX'
    ])
  })

  it('내용이 없으면 빈 배열', () => {
    expect(parseHotwordText('  , \n ')).toEqual([])
  })
})
