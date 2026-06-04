import { describe, expect, it, vi } from 'vitest'
import { maskPath } from './ipc'

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'home') return 'C:\\Users\\testuser'
      return 'test-user-data'
    }
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

describe('maskPath', () => {
  it('masks the user home directory with ~', () => {
    const original = 'C:\\Users\\testuser\\AppData\\Roaming\\CaptionX\\history'
    const masked = maskPath(original)
    expect(masked).toBe('~\\AppData\\Roaming\\CaptionX\\history')
  })

  it('keeps path unchanged if it does not start with home directory', () => {
    const original = 'D:\\some\\other\\path\\history'
    const masked = maskPath(original)
    expect(masked).toBe(original)
  })

  it('handles custom home directory parameter', () => {
    const original = '/home/customuser/AppData/Roaming/CaptionX/history'
    const masked = maskPath(original, '/home/customuser')
    expect(masked).toBe('~/AppData/Roaming/CaptionX/history')
  })

  it('performs case-insensitive comparison for paths (especially Windows)', () => {
    const original = 'c:\\users\\testuser\\AppData\\Roaming\\CaptionX\\history'
    const masked = maskPath(original)
    expect(masked).toBe('~\\AppData\\Roaming\\CaptionX\\history')
  })
})
