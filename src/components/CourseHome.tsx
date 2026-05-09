import { type FormEvent, useEffect, useState } from 'react'
import { useNotify } from '../context/NotifyContext'
import type { Course } from '../db'
import { db } from '../db'

const CAT_LABEL: Record<string, string> = {
  language: 'Language',
  science: 'Science',
  coding: 'Coding',
  exam: 'Exam',
  custom: 'Custom',
}

export function CourseHome({
  refreshKey,
  onOpenCourse,
  pendingRound,
  onGoToPendingCourse,
  onDiscardPendingRound,
}: {
  refreshKey: number
  onOpenCourse: (c: Course) => void
  pendingRound: { courseId: string; courseName: string; remaining: number } | null
  onGoToPendingCourse: () => void
  onDiscardPendingRound: () => void
}) {
  const notify = useNotify()
  const [courses, setCourses] = useState<Course[]>([])
  const [stats, setStats] = useState<Record<string, { total: number; due: number; fresh: number }>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('language')

  const load = async () => {
    const list = await db.listCourses()
    setCourses(list)
    const now = Date.now()
    const m: Record<string, { total: number; due: number; fresh: number }> = {}
    for (const c of list) {
      const [total, due, fresh] = await Promise.all([
        db.cardCountInCourse(c.id),
        db.dueFifoInCourse(c.id, now).then((r) => r.length),
        db.unintroducedFifoInCourse(c.id).then((r) => r.length),
      ])
      m[c.id] = { total, due, fresh }
    }
    setStats(m)
  }

  useEffect(() => {
    void load()
  }, [refreshKey])

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const now = Date.now()
    const id = db.generateId()
    await db.courses.add({
      id,
      name: n,
      category: category || 'custom',
      createdAt: now,
      updatedAt: now,
    })
    setName('')
    setCategory('language')
    setCreateOpen(false)
    await load()
    notify(`Course “${n}” created.`)
  }

  return (
    <div className="px-4 pb-28 max-w-lg w-full mx-auto space-y-4">
      {pendingRound && (
        <div className="glass-panel p-4 space-y-3 border border-amber-400/25 bg-amber-400/[0.06]">
          <p className="text-xs uppercase tracking-widest text-amber-200/80">Round in progress</p>
          <p className="text-sm text-slate-200">
            You have <span className="text-amber-200 font-medium">{pendingRound.remaining}</span> card
            {pendingRound.remaining === 1 ? '' : 's'} left in &quot;{pendingRound.courseName}&quot;.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl bg-sky-500/90 text-slate-950 text-sm font-semibold"
              onClick={onGoToPendingCourse}
            >
              Open course
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl border border-white/20 text-slate-200 text-sm"
              onClick={onDiscardPendingRound}
            >
              Discard round
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Step 1</p>
            <p className="text-lg font-semibold text-slate-100">Pick a course</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Each course keeps its own cards and study queue. Open one to add cards, import with AI, and study.
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 px-3 py-2 rounded-lg bg-sky-500/90 text-slate-950 text-xs font-semibold"
            onClick={() => setCreateOpen(true)}
          >
            New course
          </button>
        </div>
      </div>

      {courses.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">No courses.</p>
      ) : (
        <ul className="space-y-2">
          {courses.map((c) => {
            const s = stats[c.id]
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpenCourse(c)}
                  className="w-full glass-card p-4 text-left flex items-center justify-between gap-3 transition hover:bg-white/[0.07]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-100 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {CAT_LABEL[c.category] ?? c.category} · {s?.total ?? 0} cards
                    </p>
                  </div>
                  <div className="text-right text-[11px] text-slate-400 shrink-0">
                    <div>
                      Due: <span className="text-sky-300">{s?.due ?? 0}</span>
                    </div>
                    <div>New: {s?.fresh ?? 0}</div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            className="glass-card w-full max-w-md p-4 space-y-3"
            onSubmit={(e) => void submitCreate(e)}
          >
            <p className="font-medium text-slate-100">New course</p>
            <label className="block text-xs text-slate-400">
              Name
              <input
                autoFocus
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spanish verbs"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Category
              <select
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {Object.entries(CAT_LABEL).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="flex-1 py-2 rounded-lg border border-white/15 text-sm"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2 rounded-lg bg-sky-500/90 text-slate-950 text-sm font-medium">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
