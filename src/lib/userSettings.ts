const BATCH_KEY = 'mindglass_cards_per_round'
const PRON_LANG_KEY = 'mindglass_pronunciation_lang'

export const DEFAULT_CARDS_PER_ROUND = 14
export const DEFAULT_PRONUNCIATION_LANG = 'en-US'
export const MIN_CARDS_PER_ROUND = 1
export const MAX_CARDS_PER_ROUND = 60

export function getCardsPerRound(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_CARDS_PER_ROUND
  const raw = localStorage.getItem(BATCH_KEY)
  const n = raw != null ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return DEFAULT_CARDS_PER_ROUND
  return Math.min(MAX_CARDS_PER_ROUND, Math.max(MIN_CARDS_PER_ROUND, n))
}

export function setCardsPerRound(n: number): void {
  const v = Math.min(
    MAX_CARDS_PER_ROUND,
    Math.max(MIN_CARDS_PER_ROUND, Math.round(Number(n)) || DEFAULT_CARDS_PER_ROUND),
  )
  localStorage.setItem(BATCH_KEY, String(v))
}

/** BCP-47 language tag for speech (e.g. en-US, sv-SE). Fallback when a card has no language_code. */
export function getPronunciationLang(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_PRONUNCIATION_LANG
  const raw = localStorage.getItem(PRON_LANG_KEY)?.trim()
  if (!raw) return DEFAULT_PRONUNCIATION_LANG
  return raw
}

export function setPronunciationLang(lang: string): void {
  const t = lang.trim()
  localStorage.setItem(PRON_LANG_KEY, t || DEFAULT_PRONUNCIATION_LANG)
}

function pronunciationLangIsEnglish(g: string): boolean {
  const x = g.trim().toLowerCase().replace(/_/g, '-')
  return x === 'en' || x.startsWith('en-')
}

/** True for bare `en` or any `en-*` BCP-47 tag (cards often store `en-us` after import). */
function cardLangIsEnglishFamily(c: string): boolean {
  const x = c.trim().toLowerCase().replace(/_/g, '-')
  return x === 'en' || x.startsWith('en-')
}

/**
 * BCP-47 tag for Web Speech on this card. Empty card code → app speech setting.
 * Generic `en` on the card is treated as “unset” when the app speech language is not English,
 * so Swedish learners aren’t stuck with English TTS after imports defaulted to `en`.
 */
export function resolveSpeechLangForCard(cardLanguageCode: string | null | undefined): string {
  const c = cardLanguageCode?.trim() ?? ''
  const global = getPronunciationLang()
  if (!c) return global
  if (cardLangIsEnglishFamily(c) && !pronunciationLangIsEnglish(global)) return global
  return c
}
