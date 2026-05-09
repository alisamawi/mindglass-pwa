import { useEffect, useState } from 'react'
import { db } from '../db'
import type { Course } from '../db'
import { loadStreak } from '../lib/streak'
import { LITECK_INTERVAL_DAYS } from '../lib/liteck'

const CAT_LABEL: Record<string, string> = {
  language: 'Language',
  science: 'Science',
  coding: 'Coding',
  exam: 'Exam',
  custom: 'Custom',
}

type CourseInsight = {
  course: Course
  total: number
  due: number
  fresh: number
  boxes: Record<number, number>
  hardest: Awaited<ReturnType<typeof db.hardestInCourse>>
}

export function Insights({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<CourseInsight[]>([])
  const [streak, setStreak] = useState(loadStreak())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const courses = await db.listCourses()
      const now = Date.now()
      const out: CourseInsight[] = []
      for (const course of courses) {
        const [total, dueList, freshList, boxes, hardest] = await Promise.all([
          db.cardCountInCourse(course.id),
          db.dueFifoInCourse(course.id, now),
          db.unintroducedFifoInCourse(course.id),
          db.countsByBoxInCourse(course.id),
          db.hardestInCourse(course.id, 6),
        ])
        out.push({
          course,
          total,
          due: dueList.length,
          fresh: freshList.length,
          boxes,
          hardest,
        })
      }
      if (!cancelled) {
        setRows(out)
        setStreak(loadStreak())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return (
    <div className="px-4 pb-28 max-w-lg w-full mx-auto space-y-4">
      <div className="glass-panel p-4">
        <p className="text-xs uppercase tracking-widest text-slate-400">Overall</p>
        <p className="text-3xl font-semibold text-glow mt-1">{streak.streak} day(s)</p>
        <p className="text-xs text-slate-500 mt-1">Streak updates when you finish a full study batch.</p>
      </div>

      <p className="text-sm font-medium text-slate-200 px-1">By course</p>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-6">Create a course on the Study tab to see stats here.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((r) => (
            <div key={r.course.id} className="glass-panel p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-100">{r.course.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {CAT_LABEL[r.course.category] ?? r.course.category} · {r.total} cards
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-400 shrink-0">
                  <div>
                    Due: <span className="text-sky-300">{r.due}</span>
                  </div>
                  <div>New: {r.fresh}</div>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Liteck boxes</p>
                <div className="grid grid-cols-5 gap-1.5 text-center text-[10px]">
                  {[0, 1, 2, 3, 4].map((b) => (
                    <div key={b} className="glass-card rounded-lg p-1.5">
                      <div className="text-sky-300 font-semibold">{b + 1}</div>
                      <div className="text-slate-500 mt-0.5">~{LITECK_INTERVAL_DAYS[b]}d</div>
                      <div className="text-sm mt-1">{r.boxes[b] ?? 0}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Hardest in this course</p>
                {r.hardest.length === 0 ? (
                  <p className="text-xs text-slate-500">No failures recorded.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {r.hardest.map((c) => (
                      <li key={c.id} className="flex justify-between text-xs gap-2">
                        <span className="truncate">{c.word || '(blank)'}</span>
                        <span className="text-rose-300 shrink-0">{c.failCount} fails</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
