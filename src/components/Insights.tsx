import { useEffect, useState } from 'react'
import { db } from '../db'
import { loadStreak } from '../lib/streak'
import { LITECK_INTERVAL_DAYS } from '../lib/liteck'

export function Insights({ refreshKey }: { refreshKey: number }) {
  const [boxes, setBoxes] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 })
  const [hardest, setHardest] = useState<Awaited<ReturnType<typeof db.hardest>>>([])
  const [streak, setStreak] = useState(loadStreak())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [bc, h] = await Promise.all([db.countsByBox(), db.hardest(8)])
      if (!cancelled) {
        setBoxes(bc)
        setHardest(h)
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
        <p className="text-xs uppercase tracking-widest text-slate-400">Streak</p>
        <p className="text-3xl font-semibold text-glow mt-1">{streak.streak} day(s)</p>
        <p className="text-xs text-slate-500 mt-1">Updates when you finish a full batch.</p>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <p className="text-sm font-medium text-slate-200">Liteck boxes</p>
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {[0, 1, 2, 3, 4].map((b) => (
            <div key={b} className="glass-card rounded-xl p-2">
              <div className="text-sky-300 font-semibold">{b + 1}</div>
              <div className="text-[10px] text-slate-400 mt-1">
                ~{LITECK_INTERVAL_DAYS[b]}d
              </div>
              <div className="text-lg mt-2">{boxes[b] ?? 0}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel p-4 space-y-2">
        <p className="text-sm font-medium text-slate-200">Hardest terms</p>
        {hardest.length === 0 ? (
          <p className="text-sm text-slate-500">No failures yet.</p>
        ) : (
          <ul className="space-y-2">
            {hardest.map((c) => (
              <li key={c.id} className="flex justify-between text-sm gap-3">
                <span className="truncate">{c.word || '(blank)'}</span>
                <span className="text-rose-300 shrink-0">{c.failCount} fails</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
