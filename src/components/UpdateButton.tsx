import type { UpdaterApi } from '../hooks/useUpdater'
import { useTranslation } from '../i18n'

/**
 * Update action button displayed in the header.
 * - available: "Download Update" button
 * - downloading: Displays progress (disabled)
 * - downloaded: "Restart and Install" button
 * Renders nothing in other phases (idle/checking/not-available/error).
 */
export function UpdateButton({ updater }: { updater: UpdaterApi }): React.JSX.Element | null {
  const t = useTranslation()
  const { status, manualInstall, download, install, openReleasePage } = updater

  if (status.phase === 'available') {
    // macOS: in-app installation not supported -> redirect to release page
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
