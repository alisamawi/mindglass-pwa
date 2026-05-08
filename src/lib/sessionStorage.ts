export const SESSION_KEY = 'mindglass_session_v1'

export type PersistedSession = {
  batchKey: string
  cardIds: string[]
  currentIndex: number
  startedAt: number
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as PersistedSession
    if (!Array.isArray(s.cardIds) || typeof s.currentIndex !== 'number') return null
    return s
  } catch {
    return null
  }
}

export function saveSession(s: PersistedSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s))
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
