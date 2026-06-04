import { join } from 'node:path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, Menu, shell } from 'electron'
import { registerIpcHandlers } from './ipc'
import { registerMediaProtocol, registerMediaSchemes } from './media-protocol'
import { resolveBundledResource } from './resources'

// Task Manager 등에 표시되는 프로세스명을 명시적으로 지정한다.
// (지정하지 않으면 package.json의 긴 description 값이 노출된다.)
app.setName('CaptionX')
process.title = 'CaptionX'

// 일부 Windows 환경에서 GPU 셰이더 디스크 캐시 이동/생성이 거부되어(0x5)
// 콘솔에 cache 오류가 반복 출력되는 것을 방지한다. (렌더링에는 영향 없음)
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

// 커스텀 미디어 스킴은 app.whenReady() 이전에 등록해야 한다.
registerMediaSchemes()

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 860,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'CaptionX',
    icon: resolveBundledResource('icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })

  window.on('ready-to-show', () => window.show())

  // 빈 화면 진단: 로드 실패/렌더러 크래시/콘솔 오류를 메인 stdout으로 전달
  window.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[renderer] did-fail-load ${code} ${desc} ${url}`)
  })
  window.webContents.on('render-process-gone', (_e, details) => {
    console.error('[renderer] render-process-gone', details)
  })
  window.webContents.on('preload-error', (_e, path, error) => {
    console.error('[preload] error', path, error)
  })
  if (is.dev) {
    window.webContents.on('console-message', ({ level, message, lineNumber, sourceId }) => {
      if (level === 'warning' || level === 'error') {
        console.error(`[renderer console] ${message} (${sourceId}:${lineNumber})`)
      }
    })
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.stelbite.captionx')

  app.on('browser-window-created', (_, win) => optimizer.watchWindowShortcuts(win))

  // IPC 핸들러는 채널당 1회만 등록한다(중복 등록 시 예외 발생).
  registerIpcHandlers()
  // 로컬 미디어 스트리밍 프로토콜 등록(렌더러 재생용).
  registerMediaProtocol()

  // 상단 메뉴 바가 나오지 않도록 설정
  Menu.setApplicationMenu(null)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
