/** {name} 형태의 자리표시자를 params 값으로 치환한다. */
export type TParams = Record<string, string | number>

/**
 * 번역 문자열의 {placeholder} 를 params 값으로 치환한다.
 * params 에 없는 자리표시자는 원형 그대로 둔다(키 누락을 눈에 띄게 한다).
 */
export function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  )
}
