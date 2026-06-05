import type { UpdaterApi } from '../hooks/useUpdater'
import { useTranslation } from '../i18n'

/**
 * 헤더에 표시되는 업데이트 액션 버튼.
 * - available: "업데이트 다운로드" 버튼
 * - downloading: 진행률 표시(비활성)
 * - downloaded: "재시작하여 설치" 버튼
 * 그 외 상태(idle/checking/not-available/error)에서는 아무것도 렌더링하지 않는다.
 */
export function UpdateButton({ updater }: { updater: UpdaterApi }): React.JSX.Element | null {
  const t = useTranslation()
  const { status, manualInstall, download, install, openReleasePage } = updater

  if (status.phase === 'available') {
    // macOS: in-app 설치 불가 → 릴리스 페이지로 안내
    if (manualInstall) {
      return (
        <button
          type="button"
          className="update-btn"
          onClick={openReleasePage}
          title={t('update.available', { version: status.version ?? '' })}
        >
          ⬇ {t('update.openPage')}
        </button>
      )
    }
    return (
      <button
        type="button"
        className="update-btn"
        onClick={download}
        title={t('update.available', { version: status.version ?? '' })}
      >
        ⬇ {t('update.download')}
      </button>
    )
  }

  if (status.phase === 'downloading') {
    return (
      <button type="button" className="update-btn update-btn--progress" disabled>
        {t('update.downloading', { pct: status.percent ?? 0 })}
      </button>
    )
  }

  if (status.phase === 'downloaded') {
    return (
      <button type="button" className="update-btn update-btn--ready" onClick={install}>
        ↻ {t('update.restart')}
      </button>
    )
  }

  return null
}
