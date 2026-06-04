import type { UiThemePreference } from '../hooks/useTheme'
import { useTranslation } from '../i18n'
import { HelpIcon } from './DoodleIcons'

type InfoTooltipProps = {
  /** 툴팁으로 보여줄 설명 텍스트. */
  text: string
  /** 스크린리더용 레이블. 기본값은 현재 언어의 "도움말". */
  label?: string
  uiTheme?: UiThemePreference
}

/**
 * 작은 (?) 아이콘 위에 커서를 올리거나 포커스하면 설명을 띄우는 툴팁.
 * 마우스 hover와 키보드 focus 모두에서 동작하도록 button을 트리거로 쓴다.
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
          // label 안에 있을 때 클릭이 연결된 컨트롤로 전파되지 않도록 막는다.
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
