import Dexie, { type EntityTable } from 'dexie'

export type FlashCard = {
  id: string
  word: string
  definition: string
  hint: string
  example: string
  language_code: string
  /** Liteck box 0..4 */
  box: number
  createdAt: number
  lastGradedAt?: number
  nextReviewAt: number
  passCount: number
  failCount: number
  /** Set when first included in a study batch (FIFO intro by createdAt among unintroduced) */
  introducedAt?: number
}

export class MindGlassDB extends Dexie {
  cards!: EntityTable<FlashCard, 'id'>

  constructor() {
    super('mindglass_db')
    this.version(1).stores({
      cards: 'id, createdAt, nextReviewAt, box, failCount, introducedAt',
    })
  }

  generateId(): string {
    return crypto.randomUUID()
  }

  /** New cards sorted by FIFO createdAt */
  async unintroducedFifo(): Promise<FlashCard[]> {
    const rows = await this.cards.filter((c) => c.introducedAt == null).sortBy('createdAt')
    return rows
  }

  /** Due/overdue excluding never-introduced (those use FIFO lane in batch builder) */
  async dueFifo(now: number): Promise<FlashCard[]> {
    const rows = await this.cards.filter((c) => c.introducedAt != null && c.nextReviewAt <= now).toArray()
    rows.sort((a, b) => a.nextReviewAt - b.nextReviewAt || a.createdAt - b.createdAt)
    return rows
  }

  /** Hardest terms by failures */
  async hardest(limit = 8): Promise<FlashCard[]> {
    const rows = await this.cards.orderBy('failCount').reverse().limit(limit).toArray()
    return rows.filter((c) => c.failCount > 0)
  }

  async markIntroduced(ids: string[], now: number): Promise<void> {
    await this.transaction('rw', this.cards, async () => {
      for (const id of ids) {
        const row = await this.cards.get(id)
        if (!row || row.introducedAt != null) continue
        await this.cards.update(id, { introducedAt: now })
      }
    })
  }

  countsByBox(): Promise<Record<number, number>> {
    return this.cards.toArray().then((cards) => {
      const m: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
      for (const c of cards) {
        const b = Math.min(4, Math.max(0, c.box))
        m[b] = (m[b] ?? 0) + 1
      }
      return m
    })
  }
}

export const db = new MindGlassDB()
