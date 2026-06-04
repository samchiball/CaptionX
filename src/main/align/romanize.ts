const INITIAL_L = [
  'g',
  'kk',
  'n',
  'd',
  'tt',
  'r',
  'm',
  'b',
  'pp',
  's',
  'ss',
  '',
  'j',
  'jj',
  'ch',
  'k',
  't',
  'p',
  'h'
]
const VOWEL_V = [
  'a',
  'ae',
  'ya',
  'yae',
  'eo',
  'e',
  'yeo',
  'ye',
  'o',
  'wa',
  'wae',
  'oe',
  'yo',
  'u',
  'wo',
  'we',
  'wi',
  'yu',
  'eu',
  'ui',
  'i'
]
const FINAL_T = [
  '',
  'g',
  'kk',
  'gs',
  'n',
  'nj',
  'nh',
  'd',
  'l',
  'lg',
  'lm',
  'lb',
  'ls',
  'lt',
  'lp',
  'lh',
  'm',
  'b',
  'bs',
  's',
  'ss',
  'ng',
  'j',
  'ch',
  'k',
  't',
  'p',
  'h'
]

function romanizeHangulChar(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) {
    const sIndex = code - 0xac00
    const l = Math.floor(sIndex / 588)
    const v = Math.floor((sIndex % 588) / 28)
    const t = sIndex % 28
    return INITIAL_L[l] + VOWEL_V[v] + FINAL_T[t]
  }
  return ch
}

const KANA_MAP: Record<string, string> = {
  あ: 'a',
  い: 'i',
  う: 'u',
  え: 'e',
  お: 'o',
  か: 'ka',
  き: 'ki',
  く: 'ku',
  け: 'ke',
  こ: 'ko',
  さ: 'sa',
  し: 'shi',
  す: 'su',
  せ: 'se',
  そ: 'so',
  た: 'ta',
  ち: 'chi',
  つ: 'tsu',
  て: 'te',
  と: 'to',
  な: 'na',
  に: 'ni',
  ぬ: 'nu',
  ね: 'ne',
  の: 'no',
  は: 'ha',
  ひ: 'hi',
  ふ: 'fu',
  へ: 'he',
  ほ: 'ho',
  ま: 'ma',
  み: 'mi',
  む: 'mu',
  め: 'me',
  も: 'mo',
  や: 'ya',
  ゆ: 'yu',
  よ: 'yo',
  ら: 'ra',
  り: 'ri',
  る: 'ru',
  れ: 're',
  ろ: 'ro',
  わ: 'wa',
  を: 'wo',
  ん: 'n',
  が: 'ga',
  ぎ: 'gi',
  ぐ: 'gu',
  げ: 'ge',
  ご: 'go',
  ざ: 'za',
  じ: 'ji',
  ず: 'zu',
  ぜ: 'ze',
  ぞ: 'zo',
  だ: 'da',
  ぢ: 'ji',
  づ: 'zu',
  で: 'de',
  ど: 'do',
  ば: 'ba',
  び: 'bi',
  ぶ: 'bu',
  べ: 'be',
  ぼ: 'bo',
  ぱ: 'pa',
  ぴ: 'pi',
  ぷ: 'pu',
  ぺ: 'pe',
  ぽ: 'po',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  っ: 't'
}

const DIGRAPHS: Record<string, string> = {
  きゃ: 'kya',
  きゅ: 'kyu',
  きょ: 'kyo',
  しゃ: 'sha',
  しゅ: 'shu',
  しょ: 'sho',
  ちゃ: 'cha',
  ちゅ: 'chu',
  ちょ: 'cho',
  にゃ: 'nya',
  にゅ: 'nyu',
  にょ: 'nyo',
  ひゃ: 'hya',
  ひゅ: 'hyu',
  ひょ: 'hyo',
  みゃ: 'mya',
  みゅ: 'myu',
  みょ: 'myo',
  りゃ: 'rya',
  りゅ: 'ryu',
  りょ: 'ryo',
  ぎゃ: 'gya',
  ぎゅ: 'gyu',
  ぎょ: 'gyo',
  じゃ: 'ja',
  じゅ: 'ju',
  じょ: 'jo',
  びゃ: 'bya',
  びゅ: 'byu',
  びょ: 'byo',
  ぴゃ: 'pya',
  ぴゅ: 'pyu',
  ぴょ: 'pyo'
}

function katakanaToHiragana(ch: string): string {
  const code = ch.charCodeAt(0)
  if (code >= 0x30a1 && code <= 0x30f6) {
    return String.fromCharCode(code - 0x60)
  }
  return ch
}

function getPrecedingVowel(str: string): string {
  if (str.length === 0) return ''
  const lastChar = str[str.length - 1]
  if (['a', 'i', 'u', 'e', 'o'].includes(lastChar)) {
    return lastChar
  }
  return ''
}

function romanizeJapanese(text: string): string {
  let result = ''
  let i = 0
  while (i < text.length) {
    const char1 = katakanaToHiragana(text[i])
    const char2 = i + 1 < text.length ? katakanaToHiragana(text[i + 1]) : ''

    // Check digraph
    const pair = char1 + char2
    if (DIGRAPHS[pair]) {
      result += DIGRAPHS[pair]
      i += 2
      continue
    }

    // Check sokuon (っ)
    if (char1 === 'っ' || text[i] === 'ッ') {
      if (char2) {
        const nextRomaji = KANA_MAP[char2] || ''
        if (
          nextRomaji &&
          nextRomaji.length > 0 &&
          !['a', 'i', 'u', 'e', 'o'].includes(nextRomaji[0])
        ) {
          result += nextRomaji[0]
          i += 1
          continue
        }
      }
      result += 't'
      i += 1
      continue
    }

    // Check prolonged sound mark (ー)
    if (text[i] === 'ー') {
      result += getPrecedingVowel(result)
      i += 1
      continue
    }

    // Standard map
    if (KANA_MAP[char1]) {
      result += KANA_MAP[char1]
    } else {
      result += text[i]
    }
    i += 1
  }
  return result
}

const CYRILLIC_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
  А: 'a',
  Б: 'b',
  В: 'v',
  Г: 'g',
  Д: 'd',
  Е: 'e',
  Ё: 'yo',
  Ж: 'zh',
  З: 'z',
  И: 'i',
  Й: 'y',
  К: 'k',
  Л: 'l',
  М: 'm',
  Н: 'n',
  О: 'o',
  П: 'p',
  Р: 'r',
  С: 's',
  Т: 't',
  У: 'u',
  Ф: 'f',
  Х: 'kh',
  Ц: 'ts',
  Ч: 'ch',
  Ш: 'sh',
  Щ: 'shch',
  Ъ: '',
  Ы: 'y',
  Ь: '',
  Э: 'e',
  Ю: 'yu',
  Я: 'ya'
}

const GREEK_MAP: Record<string, string> = {
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o',
  Α: 'a',
  Β: 'v',
  Γ: 'g',
  Δ: 'd',
  Ε: 'e',
  Ζ: 'z',
  Η: 'i',
  Θ: 'th',
  Ι: 'i',
  Κ: 'k',
  Λ: 'l',
  Μ: 'm',
  Ν: 'n',
  Ξ: 'x',
  Ο: 'o',
  Π: 'p',
  Ρ: 'r',
  Σ: 's',
  Τ: 't',
  Υ: 'y',
  Φ: 'f',
  Χ: 'ch',
  Ψ: 'ps',
  Ω: 'o'
}

export function romanizeWord(word: string): string {
  let text = word.normalize('NFC')

  // Korean
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const code = ch.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) {
      result += romanizeHangulChar(ch)
    } else {
      result += ch
    }
  }
  text = result

  // Japanese
  text = romanizeJapanese(text)

  // Accents (diacritics)
  text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

  // Cyrillic & Greek
  result = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (CYRILLIC_MAP[ch]) {
      result += CYRILLIC_MAP[ch]
    } else if (GREEK_MAP[ch]) {
      result += GREEK_MAP[ch]
    } else {
      result += ch
    }
  }
  text = result

  return text.toLowerCase()
}
