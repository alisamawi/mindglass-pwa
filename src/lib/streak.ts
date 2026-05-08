const DAY_MS = 86_400_000
const KEY = 'mindglass_streak_v1'

export type StreakState = {
  lastCompletedDay: string
  streak: number
}

export function loadStreak(): StreakState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { lastCompletedDay: '', streak: 0 }
    return JSON.parse(raw) as StreakState
  } catch {
    return { lastCompletedDay: '', streak: 0 }
  }
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function prevDay(day: string): string {
  const t = Date.parse(day + 'T12:00:00.000Z')
  return isoDay(new Date(t - DAY_MS))
}

/** Call when user finishes an entire batch */
export function recordBatchCompleted(): StreakState {
  const prev = loadStreak()
  const today = isoDay(new Date())

  if (prev.lastCompletedDay === today) {
    return prev
  }

  const yesterday = prevDay(today)
  const streak =
    prev.lastCompletedDay === '' ? 1 : prev.lastCompletedDay === yesterday ? prev.streak + 1 : 1

  const next: StreakState = { lastCompletedDay: today, streak }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}
