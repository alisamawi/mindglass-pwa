import Dexie, { type EntityTable } from 'dexie'

export type Course = {
  id: string
  name: string
  /** MindGlass category: language | science | coding | exam | custom */
  category: string
  createdAt: number
  updatedAt: number
}

export type FlashCard = {
  id: string
  courseId: string
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
  courses!: EntityTable<Course, 'id'>
  cards!: EntityTable<FlashCard, 'id'>

  constructor() {
    super('mindglass_db')

    this.version(1).stores({
      cards: 'id, createdAt, nextReviewAt, box, failCount, introducedAt',
    })

    this.version(2)
      .stores({
        courses: 'id, createdAt, name',
        cards: 'id, courseId, createdAt, nextReviewAt, box, failCount, introducedAt',
      })
      .upgrade(async (tx) => {
        const defaultId = crypto.randomUUID()
        await tx.table('courses').add({
          id: defaultId,
          name: 'General',
          category: 'custom',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } satisfies Course)
        await tx
          .table('cards')
          .toCollection()
          .modify((c: FlashCard & { courseId?: string }) => {
            c.courseId = defaultId
          })
      })
  }

  generateId(): string {
    return crypto.randomUUID()
  }

  async listCourses(): Promise<Course[]> {
    return this.courses.orderBy('name').toArray()
  }

  async cardCountInCourse(courseId: string): Promise<number> {
    return this.cards.where('courseId').equals(courseId).count()
  }

  /** Lowercased trimmed "front" keys for duplicate checks within a course */
  async wordKeysInCourse(courseId: string): Promise<Set<string>> {
    const rows = await this.cards.where('courseId').equals(courseId).toArray()
    return new Set(rows.map((c) => c.word.trim().toLowerCase()).filter(Boolean))
  }

  /** New cards sorted by FIFO createdAt */
  async unintroducedFifoInCourse(courseId: string): Promise<FlashCard[]> {
    const rows = await this.cards
      .where('courseId')
      .equals(courseId)
      .and((c) => c.introducedAt == null)
      .sortBy('createdAt')
    return rows
  }

  /** Due/overdue excluding never-introduced */
  async dueFifoInCourse(courseId: string, now: number): Promise<FlashCard[]> {
    const rows = await this.cards
      .where('courseId')
      .equals(courseId)
      .and((c) => c.introducedAt != null && c.nextReviewAt <= now)
      .toArray()
    rows.sort((a, b) => a.nextReviewAt - b.nextReviewAt || a.createdAt - b.createdAt)
    return rows
  }

  /** @deprecated global FIFO — use course-scoped helpers */
  async unintroducedFifo(): Promise<FlashCard[]> {
    const rows = await this.cards.filter((c) => c.introducedAt == null).sortBy('createdAt')
    return rows
  }

  /** @deprecated */
  async dueFifo(now: number): Promise<FlashCard[]> {
    const rows = await this.cards.filter((c) => c.introducedAt != null && c.nextReviewAt <= now).toArray()
    rows.sort((a, b) => a.nextReviewAt - b.nextReviewAt || a.createdAt - b.createdAt)
    return rows
  }

  async countsByBoxInCourse(courseId: string): Promise<Record<number, number>> {
    const rows = await this.cards.where('courseId').equals(courseId).toArray()
    const m: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const c of rows) {
      const b = Math.min(4, Math.max(0, c.box))
      m[b] = (m[b] ?? 0) + 1
    }
    return m
  }

  async hardestInCourse(courseId: string, limit = 8): Promise<FlashCard[]> {
    const rows = await this.cards.where('courseId').equals(courseId).toArray()
    rows.sort((a, b) => b.failCount - a.failCount || a.createdAt - b.createdAt)
    return rows.filter((c) => c.failCount > 0).slice(0, limit)
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

  async deleteCourseAndCards(courseId: string): Promise<void> {
    await this.transaction('rw', this.courses, this.cards, async () => {
      await this.cards.where('courseId').equals(courseId).delete()
      await this.courses.delete(courseId)
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

  async hardest(limit = 8): Promise<FlashCard[]> {
    const rows = await this.cards.orderBy('failCount').reverse().limit(limit).toArray()
    return rows.filter((c) => c.failCount > 0)
  }
}

export const db = new MindGlassDB()
