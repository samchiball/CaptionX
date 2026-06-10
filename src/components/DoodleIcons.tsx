import type * as React from 'react'

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  uiTheme?: 'default' | 'doodle'
}

/**
 * 톱니바퀴 (설정) 아이콘
 */
export function GearIcon({ uiTheme = 'default', ...props }: IconProps): React.JSX.Element {
  if (uiTheme === 'doodle') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.2em"
        height="1.2em"
        aria-hidden="true"
        {...props}
      >
        {/* 삐뚤빼뚤 톱니바퀴 바깥 톱니선 (지그재그/둥글게 튀어나온 톱니들) */}
        <path d="M 12 3.5 C 13.5 3.3, 13.8 5.2, 14.5 5.5 C 15.6 5.2, 16.4 4.1, 17.5 4.8 C 17.7 5.8, 16.7 6.6, 17.2 7.5 C 18.5 7.6, 19.3 6.9, 20.2 7.9 C 20.0 9.0, 18.7 9.5, 18.8 10.6 C 20.0 11.1, 20.6 10.9, 20.8 12 C 20.5 13.1, 19.2 13.1, 19 14.2 C 19.8 15.1, 19.5 16.2, 18.8 16.8 C 18.2 16.7, 17.4 15.8, 16.8 16.5 C 16.6 17.6, 17.2 18.5, 16.5 19.2 C 15.4 19.0, 14.8 17.9, 14.1 17.8 C 13.4 18.7, 13.4 19.8, 12.3 20.2 C 11.5 20.0, 11.0 18.7, 10.2 18.5 C 9.1 18.8, 8.3 19.9, 7.2 19.2 C 7.0 18.2, 8.0 17.4, 7.5 16.5 C 6.2 16.4, 5.4 17.1, 4.5 16.1 C 4.7 15.0, 6.0 14.5, 5.9 13.4 C 4.7 12.9, 4.1 13.1, 3.9 12 C 4.2 10.9, 5.5 10.9, 5.7 9.8 C 4.9 8.9, 5.2 7.8, 5.9 7.2 C 6.5 7.3, 7.3 8.2, 7.9 7.5 C 8.1 6.4, 7.5 5.5, 8.2 4.8 C 9.3 5.0, 9.9 6.1, 10.6 6.2 C 11.3 5.3, 11.3 4.2, 12 3.8" />
        {/* 가운데 구멍 */}
        <path d="M 12 9 C 10.5 9.2, 9.2 10.5, 9.5 12.2 C 9.8 13.9, 11.2 15.0, 12.8 14.7 C 14.4 14.4, 15.1 12.7, 14.8 11 C 14.5 9.5, 13.5 8.8, 12 9 Z" />
      </svg>
    )
  }

  // Clean Default Vector
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/**
 * 닫기 / X 아이콘
 */
export function CloseIcon({ uiTheme = 'default', ...props }: IconProps): React.JSX.Element {
  if (uiTheme === 'doodle') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.2em"
        height="1.2em"
        aria-hidden="true"
        {...props}
      >
        {/* 살짝 휘고 엇나가는 손그림 스타일 X */}
        <path d="M 5.2 5.5 C 9.1 8.3, 14.8 13.9, 18.5 18.2" />
        <path d="M 18.8 5.3 C 15.2 8.7, 9.4 14.5, 5.2 18.5" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/**
 * 지구본 (언어) 아이콘
 */
export function GlobeIcon({ uiTheme = 'default', ...props }: IconProps): React.JSX.Element {
  if (uiTheme === 'doodle') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.2em"
        height="1.2em"
        aria-hidden="true"
        {...props}
      >
        {/* 찌그러진 동그라미 지구 */}
        <path d="M 12 2.5 C 17.1 2.7, 21.4 6.8, 21.2 12 C 21 17.2, 17.2 21.2, 12 21.5 C 6.8 21.2, 2.8 17.2, 2.5 12 C 2.7 6.8, 6.9 2.7, 12 2.5 Z" />
        {/* 가로 적도선 */}
        <path d="M 2.9 12 C 8.5 13.2, 15.5 10.8, 21.1 12" />
        {/* 삐뚤한 경도선들 */}
        <path d="M 12 2.6 C 8.5 8.5, 8.5 15.5, 12 21.4" />
        <path d="M 12 2.6 C 15.5 8.5, 15.5 15.5, 12 21.4" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

/**
 * 태양 (라이트 모드) 아이콘
 */
export function SunIcon({ uiTheme = 'default', ...props }: IconProps): React.JSX.Element {
  if (uiTheme === 'doodle') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.2em"
        height="1.2em"
        aria-hidden="true"
        {...props}
      >
        {/* 울퉁불퉁 찌그러진 해 */}
        <path d="M 12.2 7.7 C 14.5 7.4, 16.4 9.3, 16.2 11.8 C 15.9 14.3, 14.1 16.2, 11.7 15.9 C 9.4 15.6, 7.8 13.8, 8.1 11.5 C 8.4 9.4, 9.9 7.9, 12.2 7.7 Z" />
        {/* 삐죽거리는 햇살들 */}
        <path d="M 12 2 L 12 4 M 12 20 L 12 22 M 2 12 L 4 12 M 20 12 L 22 12" />
        <path d="M 4.9 4.9 L 6.3 6.3 M 17.7 17.7 L 19.1 19.1 M 4.9 19.1 L 6.3 17.7 M 17.7 6.3 L 19.1 4.9" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

/**
 * 달 (다크 모드) 아이콘
 */
export function MoonIcon({ uiTheme = 'default', ...props }: IconProps): React.JSX.Element {
  if (uiTheme === 'doodle') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.2em"
        height="1.2em"
        aria-hidden="true"
        {...props}
      >
        {/* 삐뚤빼뚤 초승달 */}
        <path d="M 12 3 C 7.2 5, 7 14.8, 14 19.5 C 18.5 20.5, 19.8 17.8, 20.2 17.3 C 15.3 16.8, 10.6 12.3, 11.5 5 C 11.7 4.2, 12.1 3.5, 12 3 Z" />
        {/* 조그마한 수제 별 하나 */}
        <path d="M 17.5 4 L 18 5.5 L 19.5 5.5 L 18.2 6.5 L 18.7 8 L 17.5 7 L 16.3 8 L 16.8 6.5 L 15.5 5.5 L 17 5.5 Z" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      {...props}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

/**
 * 모니터 / 시스템 (시스템 모드) 아이콘
 */
export function SystemIcon({ uiTheme = 'default', ...props }: IconProps): React.JSX.Element {
  if (uiTheme === 'doodle') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.2em"
        height="1.2em"
        aria-hidden="true"
        {...props}
      >
        {/* 모니터 스크린 */}
        <path d="M 3.2 4.2 C 8.8 3.3, 14.8 4.7, 20.5 3.8 C 21 8.8, 20.2 12.8, 20.7 15.2 C 15.2 15.7, 9.2 14.3, 3.2 15.2 C 2.8 12.8, 3.8 8.8, 3.2 4.2 Z" />
        {/* 스탠드 목과 받침대 */}
        <path d="M 11 15.2 C 11.2 17, 11 18, 8.5 19 C 10.8 19.6, 12.8 19.6, 15 19 C 12.8 18, 12.8 17, 13 15.2" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      {...props}
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

/**
 * 도움말 / 물음표 아이콘
 */
export function HelpIcon({ uiTheme = 'default', ...props }: IconProps): React.JSX.Element {
  if (uiTheme === 'doodle') {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        width="1.2em"
        height="1.2em"
        aria-hidden="true"
        {...props}
      >
        {/* 삐뚤빼뚤 물음표 */}
        <path d="M 8.8 8.2 C 9.5 5, 14.5 4.8, 15.5 7.8 C 16 9.8, 14.3 11.3, 13.1 12.8 C 12.2 14.1, 12.2 15.2, 12 16.5" />
        {/* 점 */}
        <circle cx="12" cy="20" r="1.2" fill="currentColor" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1.2em"
      height="1.2em"
      aria-hidden="true"
      {...props}
    >
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
