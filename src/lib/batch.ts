import type { FlashCard } from '../db'
import { db } from '../db'
import { getCardsPerRound } from './userSettings'

/** Deterministic batch id for persistence */
export function computeBatchKey(cardIds: string[]): string {
  return [...cardIds].sort().join('|')
}

/**
 * FIFO: overdue/due cards first (by nextReviewAt, then createdAt),
 * then unintroduced new cards strictly by createdAt ascending.
 */
export async function buildDailyBatch(
  now: number,
  api: BatchApi,
  cap = getCardsPerRound(),
): Promise<string[]> {
  const due = await api.dueFifo(now)
  const fresh = await api.unintroducedFifo()

  const ids: string[] = []
  for (const c of due) {
    if (ids.length >= cap) break
    ids.push(c.id)
  }
  for (const c of fresh) {
    if (ids.length >= cap) break
    ids.push(c.id)
  }
  return ids
}

export type BatchApi = {
  dueFifo: (now: number) => Promise<FlashCard[]>
  unintroducedFifo: () => Promise<FlashCard[]>
}

/** Course-scoped queues */
export function dexieBatchApi(courseId: string): BatchApi {
  return {
    dueFifo: (now) => db.dueFifoInCourse(courseId, now),
    unintroducedFifo: () => db.unintroducedFifoInCourse(courseId),
  }
}
