export const SESSION_KEY = 'mindglass_session_v2'

export type PersistedSession = {
  courseId: string
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
    if (
      !s ||
      typeof s.courseId !== 'string' ||
      !Array.isArray(s.cardIds) ||
      typeof s.currentIndex !== 'number'
    ) {
      return null
    }
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

/** Saved batch with cards still to review (not an empty or completed session). */
export function getPendingSession(): PersistedSession | null {
  const s = loadSession()
  if (!s?.cardIds.length || s.currentIndex >= s.cardIds.length) return null
  return s
}
