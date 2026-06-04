export type LanguageOption = {
  code: string
  korean: string
  english: string
}

export const AUTO_LANGUAGE_CODE = ''

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'ko', korean: '한국어', english: 'Korean' },
  { code: 'en', korean: '영어', english: 'English' },
  { code: 'ja', korean: '일본어', english: 'Japanese' },
  { code: 'zh', korean: '중국어', english: 'Chinese' },
  { code: 'es', korean: '스페인어', english: 'Spanish' },
  { code: 'fr', korean: '프랑스어', english: 'French' },
  { code: 'de', korean: '독일어', english: 'German' },
  { code: 'it', korean: '이탈리아어', english: 'Italian' },
  { code: 'pt', korean: '포르투갈어', english: 'Portuguese' },
  { code: 'ru', korean: '러시아어', english: 'Russian' },
  { code: 'ar', korean: '아랍어', english: 'Arabic' },
  { code: 'hi', korean: '힌디어', english: 'Hindi' },
  { code: 'vi', korean: '베트남어', english: 'Vietnamese' },
  { code: 'th', korean: '태국어', english: 'Thai' },
  { code: 'id', korean: '인도네시아어', english: 'Indonesian' },
  { code: 'tr', korean: '터키어', english: 'Turkish' },
  { code: 'nl', korean: '네덜란드어', english: 'Dutch' },
  { code: 'pl', korean: '폴란드어', english: 'Polish' },
  { code: 'sv', korean: '스웨덴어', english: 'Swedish' },
  { code: 'uk', korean: '우크라이나어', english: 'Ukrainian' },
  { code: 'he', korean: '히브리어', english: 'Hebrew' },
  { code: 'fi', korean: '핀란드어', english: 'Finnish' },
  { code: 'no', korean: '노르웨이어', english: 'Norwegian' },
  { code: 'da', korean: '덴마크어', english: 'Danish' },
  { code: 'cs', korean: '체코어', english: 'Czech' },
  { code: 'el', korean: '그리스어', english: 'Greek' },
  { code: 'ro', korean: '루마니아어', english: 'Romanian' },
  { code: 'hu', korean: '헝가리어', english: 'Hungarian' },
  { code: 'bn', korean: '벵골어', english: 'Bengali' },
  { code: 'ur', korean: '우르두어', english: 'Urdu' }
]

export function languageLabel(option: LanguageOption): string {
  return `${option.korean} (${option.code})`
}

export function findLanguageOption(value: string): LanguageOption | undefined {
  const normalized = value.trim().toLowerCase()

  if (normalized.length === 0) {
    return undefined
  }

  return LANGUAGE_OPTIONS.find(
    (option) =>
      option.code === normalized ||
      option.english.toLowerCase() === normalized ||
      option.korean.toLowerCase() === normalized ||
      languageLabel(option).toLowerCase() === normalized
  )
}

export function isAutoLanguageInput(input: string): boolean {
  const normalized = input.trim().toLowerCase()

  return normalized.length === 0 || normalized === 'auto' || normalized === '자동 감지'
}

export function filterLanguageOptions(query: string): LanguageOption[] {
  const normalized = query.trim().toLowerCase()

  if (normalized.length === 0) {
    return LANGUAGE_OPTIONS
  }

  return LANGUAGE_OPTIONS.filter((option) =>
    [option.code, option.korean, option.english, languageLabel(option)].some((value) =>
      value.toLowerCase().includes(normalized)
    )
  )
}

export function resolveLanguageInput(input: string): string {
  const normalized = input.trim()

  if (isAutoLanguageInput(normalized)) {
    return AUTO_LANGUAGE_CODE
  }

  const option = findLanguageOption(normalized)

  return option?.code ?? normalized
}
