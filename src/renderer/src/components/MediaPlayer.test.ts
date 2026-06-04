import { describe, expect, it } from 'vitest'
import { mediaPlayerViewState } from './MediaPlayer'

describe('mediaPlayerViewState', () => {
  it('준비 중에는 오류를 함께 표시하지 않는다', () => {
    expect(mediaPlayerViewState('preparing', null)).toEqual({
      showPreparing: true,
      showError: false,
      showControls: false
    })
  })

  it('오류 상태에서만 오류 메시지를 표시한다', () => {
    expect(mediaPlayerViewState('error', null)).toEqual({
      showPreparing: false,
      showError: true,
      showControls: false
    })
  })

  it('준비 완료와 src가 모두 있어야 컨트롤을 표시한다', () => {
    expect(mediaPlayerViewState('ready', 'captionx-media://file/sample')).toEqual({
      showPreparing: false,
      showError: false,
      showControls: true
    })
    expect(mediaPlayerViewState('ready', null)).toEqual({
      showPreparing: false,
      showError: false,
      showControls: false
    })
  })
})
