import type { ElectronAPI } from '@electron-toolkit/preload'
import type { CaptionXAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    api: CaptionXAPI
  }
}
