import type { UpdateStatus } from '@shared/types'
import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api'

export interface UpdaterApi {
  status: UpdateStatus
  /**
   * macOS 여부. mac 은 코드서명 없이는 in-app 자동 설치가 불가하므로
   * 감지만 자동으로 하고 설치는 릴리스 페이지로 안내한다.
   */
  manualInstall: boolean
  /** 수동 업데이트 확인(설정 창 버튼). */
  check: () => void
  /** 새 버전 백그라운드 다운로드 시작(Win/Linux). */
  download: () => void
  /** 다운로드된 업데이트 설치 후 재시작(Win/Linux). */
  install: () => void
  /** 릴리스 페이지를 외부 브라우저로 열기(macOS 수동 설치). */
  openReleasePage: () => void
}

/**
 * 자동 업데이트 상태를 구독하고 사용자 액션(확인/다운로드/설치)을 노출한다.
 * 앱 시작 시 메인이 자동으로 한 번 확인하므로 'available' 상태가 푸시되면
 * 헤더에 업데이트 버튼이 나타난다.
 */
export function useUpdater(): UpdaterApi {
  const [status, setStatus] = useState<UpdateStatus>({ phase: 'idle' })

  useEffect(() => {
    // 마운트 시점에 이미 지나간 자동 확인 결과를 한 번 받아온다.
    api
      .updateCheck()
      .then((s) => setStatus((prev) => (prev.phase === 'idle' ? s : prev)))
      .catch((err) => console.error('[useUpdater] initial check failed:', err))
    return api.onUpdateStatus(setStatus)
  }, [])

  const check = useCallback(() => {
    api.updateCheck().catch((err) => console.error('[useUpdater] check failed:', err))
  }, [])

  const download = useCallback(() => {
    api.updateDownload().catch((err) => console.error('[useUpdater] download failed:', err))
  }, [])

  const install = useCallback(() => {
    api.updateInstall().catch((err) => console.error('[useUpdater] install failed:', err))
  }, [])

  const openReleasePage = useCallback(() => {
    api
      .updateOpenReleasePage()
      .catch((err) => console.error('[useUpdater] openReleasePage failed:', err))
  }, [])

  return {
    status,
    manualInstall: api.platform === 'darwin',
    check,
    download,
    install,
    openReleasePage
  }
}
