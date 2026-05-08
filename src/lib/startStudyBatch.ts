import { clearSession, saveSession, type PersistedSession } from './sessionStorage'
import { buildDailyBatch, computeBatchKey, dexieBatchApi } from './batch'
import { db } from '../db'

export async function createNewStudySession(): Promise<PersistedSession | null> {
  const ids = await buildDailyBatch(Date.now(), dexieBatchApi())
  if (ids.length === 0) return null
  await db.markIntroduced(ids, Date.now())
  clearSession()
  const s: PersistedSession = {
    batchKey: computeBatchKey(ids),
    cardIds: ids,
    currentIndex: 0,
    startedAt: Date.now(),
  }
  saveSession(s)
  return s
}
