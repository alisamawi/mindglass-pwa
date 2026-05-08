import type { FlashCard } from '../db'
import { db } from '../db'

export const BATCH_SIZE = 14

/** Deterministic batch id for persistence */
export function computeBatchKey(cardIds: string[]): string {
  return [...cardIds].sort().join('|')
}

/**
 * FIFO: overdue/due cards first (by nextReviewAt, then createdAt),
 * then unintroduced new cards strictly by createdAt ascending.
 */
export async function buildDailyBatch(now: number, api: BatchApi): Promise<string[]> {
  const due = await api.dueFifo(now)
  const fresh = await api.unintroducedFifo()

  const ids: string[] = []
  for (const c of due) {
    if (ids.length >= BATCH_SIZE) break
    ids.push(c.id)
  }
  for (const c of fresh) {
    if (ids.length >= BATCH_SIZE) break
    ids.push(c.id)
  }
  return ids
}

export type BatchApi = {
  dueFifo: (now: number) => Promise<FlashCard[]>
  unintroducedFifo: () => Promise<FlashCard[]>
}

/** Wraps Dexie helpers so tests could inject */
export function dexieBatchApi(): BatchApi {
  return {
    dueFifo: (now) => db.dueFifo(now),
    unintroducedFifo: () => db.unintroducedFifo(),
  }
}
