import type { FlashCard } from '../db'

/** Days until next review for each box index after a successful grade at that box */
export const LITECK_INTERVAL_DAYS = [1, 1, 3, 7, 14] as const

const DAY_MS = 86_400_000

export function nextIntervalDaysForBox(boxAfterPass: number): number {
  const b = Math.min(4, Math.max(0, boxAfterPass))
  return LITECK_INTERVAL_DAYS[b] ?? 1
}

export function applyPass(card: FlashCard, now: number): FlashCard {
  const newBox = Math.min(4, card.box + 1)
  const days = nextIntervalDaysForBox(newBox)
  return {
    ...card,
    box: newBox,
    passCount: card.passCount + 1,
    lastGradedAt: now,
    nextReviewAt: now + days * DAY_MS,
  }
}

export function applyFail(card: FlashCard, now: number): FlashCard {
  return {
    ...card,
    box: 0,
    failCount: card.failCount + 1,
    lastGradedAt: now,
    nextReviewAt: now,
  }
}
