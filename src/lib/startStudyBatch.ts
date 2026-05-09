import { clearSession, saveSession, type PersistedSession } from './sessionStorage'
import { buildDailyBatch, computeBatchKey, dexieBatchApi } from './batch'
import { getCardsPerRound } from './userSettings'
import { db } from '../db'

export async function createNewStudySession(courseId: string): Promise<PersistedSession | null> {
  const ids = await buildDailyBatch(Date.now(), dexieBatchApi(courseId), getCardsPerRound())
  if (ids.length === 0) return null
  await db.markIntroduced(ids, Date.now())
  clearSession()
  const s: PersistedSession = {
    courseId,
    batchKey: computeBatchKey(ids),
    cardIds: ids,
    currentIndex: 0,
    startedAt: Date.now(),
  }
  saveSession(s)
  return s
}
