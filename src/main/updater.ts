import { IPC, type UpdateStatus } from '@shared/types'
import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'

/** 릴리스 페이지(최신). macOS 수동 설치 안내에 사용한다. */
const RELEASES_URL = 'https://github.com/samchiball/CaptionX/releases/latest'

/**
 * macOS 는 코드서명/공증 없이는 Squirrel.Mac in-place 업데이트가 동작하지 않는다.
 * 따라서 mac 에서는 감지(확인)만 자동으로 하고, 설치는 릴리스 페이지로 안내한다.
 */
const MANUAL_INSTALL = process.platform === 'darwin'

// electron-updater 의 autoUpdater 는 접근 시 플랫폼별 업데이터를 생성하며
// 생성자에서 app.getVersion() 등을 호출한다. 모듈 import 시점에 즉시 평가하면
// (테스트 등) electron 이 모킹된 환경에서 부작용이 나므로 지연 접근한다.
function getAutoUpdater(): electronUpdater.AppUpdater {
  return electronUpdater.autoUpdater
}

/** 마지막으로 렌더러에 전달한 상태(설정 창이 새로 열릴 때 즉시 동기화하는 용도). */
let lastStatus: UpdateStatus = { phase: 'idle' }

function broadcast(status: UpdateStatus): void {
  lastStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.webContents.isDestroyed()) {
      win.webContents.send(IPC.updateStatus, status)
    }
  }
}

/** 현재 알려진 업데이트 상태(렌더러 초기 동기화용). */
export function currentUpdateStatus(): UpdateStatus {
  return lastStatus
}

let wired = false

/**
 * autoUpdater 이벤트를 렌더러 상태로 매핑한다.
 * 다운로드는 사용자가 버튼을 누를 때만 시작하도록 autoDownload 를 끈다.
 */
function wireEvents(): void {
  if (wired) return
  wired = true

  const autoUpdater = getAutoUpdater()
  // 사용자가 명시적으로 "업데이트 다운로드" 를 누를 때까지 자동 다운로드하지 않는다.
  autoUpdater.autoDownload = false
  // 다운로드 완료 후 앱 종료 시 자동 설치한다(우리는 quitAndInstall 로 직접 재시작).
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => broadcast({ phase: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({ phase: 'available', version: info.version })
  )
  autoUpdater.on('update-not-available', () => broadcast({ phase: 'not-available' }))
  autoUpdater.on('download-progress', (p) =>
    broadcast({ phase: 'downloading', percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({ phase: 'downloaded', version: info.version })
  )
  autoUpdater.on('error', (err) =>
    broadcast({ phase: 'error', message: err == null ? 'unknown' : (err.message ?? String(err)) })
  )
}

/** 업데이트 확인(개발 모드에서는 패키징 정보가 없어 건너뛴다). */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    broadcast({ phase: 'not-available' })
    return
  }
  wireEvents()
  try {
    await getAutoUpdater().checkForUpdates()
  } catch (err) {
    broadcast({
      phase: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

/** 새 버전 백그라운드 다운로드한다. macOS 는 in-app 설치 불가라 무시한다. */
export async function downloadUpdate(): Promise<void> {
  if (!app.isPackaged || MANUAL_INSTALL) return
  wireEvents()
  try {
    await getAutoUpdater().downloadUpdate()
  } catch (err) {
    broadcast({
      phase: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
  }
}

/** 다운로드된 업데이트를 설치하고 앱을 재시작한다. macOS 는 무시한다. */
export function quitAndInstall(): void {
  if (!app.isPackaged || MANUAL_INSTALL) return
  // isSilent=false(설치 UI 표시), isForceRunAfter=true(설치 후 자동 실행)
  getAutoUpdater().quitAndInstall(false, true)
}

/** 릴리스 페이지를 외부 브라우저로 연다(macOS 수동 설치 안내). */
export function openReleasePage(): Promise<void> {
  return shell.openExternal(RELEASES_URL)
}

/**
 * 앱 시작 시 한 번 자동으로 업데이트를 확인한다.
 * 윈도우가 준비된 뒤 호출해 상태 푸시가 렌더러에 도달하도록 한다.
 */
export function initAutoUpdater(): void {
  if (!app.isPackaged) return
  wireEvents()
  void checkForUpdates()
}
