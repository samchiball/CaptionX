import type { UiThemePreference } from '../hooks/useTheme'
import { useTranslation } from '../i18n'
import { HelpIcon } from './DoodleIcons'

type InfoTooltipProps = {
  /** Explanatory text to show in the tooltip. */
  text: string
  /** Label for screen readers. Default is "Help" in the current language. */
  label?: string
  uiTheme?: UiThemePreference
}

/**
 * Tooltip that displays a description when hovering or focusing on a small (?) icon.
 * Uses a button as the trigger to work with both mouse hover and keyboard focus.
 */
export function InfoTooltip({
  text,
  label,
  uiTheme = 'default'
}: InfoTooltipProps): React.JSX.Element {
  const t = useTranslation()
  const ariaLabel = label ?? t('tooltip.helpLabel')
  return (
    <span className="tooltip">
      <button
        type="button"
        className="tooltip__trigger"
        aria-label={ariaLabel}
        onClick={(e) => {
          // Prevent click propagation to parent controls (e.g., when placed inside a label).
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <HelpIcon uiTheme={uiTheme} />
      </button>
      <span role="tooltip" className="tooltip__bubble">
        {text}
      </span>
    </span>
  )
}
