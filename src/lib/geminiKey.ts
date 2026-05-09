const STORAGE_KEY = 'mindglass_gemini_api_key'

export function readStoredGeminiKey(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)?.trim()
    return v && v.length > 0 ? v : null
  } catch {
    return null
  }
}

export function writeStoredGeminiKey(key: string | null): void {
  try {
    if (key == null || key.trim() === '') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, key.trim())
    }
  } catch {
    /* ignore quota / private mode */
  }
}
