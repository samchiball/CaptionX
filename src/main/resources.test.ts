import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const appState = vi.hoisted(() => ({
  isPackaged: false,
  appPath: 'repo-captionx'
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged
    },
    getAppPath: () => appState.appPath
  }
}))

const { resolveBundledResource } = await import('./resources')

describe('resolveBundledResource', () => {
  it('개발 모드에서는 프로젝트 resources 경로를 반환한다', () => {
    appState.isPackaged = false
    appState.appPath = join('repo', 'captionx')

    expect(resolveBundledResource('gtcrn_offline.onnx')).toBe(
      join('repo', 'captionx', 'resources', 'gtcrn_offline.onnx')
    )
  })

  it('패키징 후에는 asar 내부가 아니라 process.resourcesPath/resources를 반환한다', () => {
    appState.isPackaged = true
    Object.defineProperty(process, 'resourcesPath', {
      value: join('CaptionX.app', 'Contents', 'Resources'),
      configurable: true
    })

    expect(resolveBundledResource('gtcrn_offline.onnx')).toBe(
      join('CaptionX.app', 'Contents', 'Resources', 'resources', 'gtcrn_offline.onnx')
    )
  })
})
