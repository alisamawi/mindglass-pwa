import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type { Course } from '../db'
import { db } from '../db'
import { createNewStudySession } from '../lib/startStudyBatch'
import { clearSession, loadSession, type PersistedSession } from '../lib/sessionStorage'
import { getCardsPerRound, getPronunciationLang } from '../lib/userSettings'
import { useNotify } from '../context/NotifyContext'
import { AiImportModal } from './AiImportModal'
import type { GeminiAuth } from '../lib/gemini'

export function StudyLab({
  course,
  geminiAuth,
  onBack,
  onDeckReady,
  refreshTick,
  onCardsChanged,
  onOpenSettings,
  onCourseDeleted,
}: {
  course: Course
  geminiAuth: GeminiAuth
  onBack: () => void
  onDeckReady: (session: PersistedSession) => void
  refreshTick: number
  onCardsChanged: () => void
  onOpenSettings: () => void
  onCourseDeleted: (courseId: string) => void
}) {
  const notify = useNotify()
  const [busy, setBusy] = useState<'idle' | 'batch' | 'delete'>('idle')
  const [error, setErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [manualOpen, setManualOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [manual, setManual] = useState({
    word: '',
    definition: '',
    hint: '',
    example: '',
    language_code: getPronunciationLang(),
  })

  const [counts, setCountsState] = useState({ due: 0, fresh: 0 })
  const roundCap = useMemo(() => getCardsPerRound(), [refreshTick])
  const pendingRound = useMemo(() => {
    const s = loadSession()
    if (!s || s.courseId !== course.id || !s.cardIds.length || s.currentIndex >= s.cardIds.length) return null
    return s
  }, [course.id, refreshTick])

  const remainingInPending = pendingRound ? pendingRound.cardIds.length - pendingRound.currentIndex : 0

  const refreshCounts = async () => {
    const now = Date.now()
    const due = await db.dueFifoInCourse(course.id, now)
    const fresh = await db.unintroducedFifoInCourse(course.id)
    setCountsState({ due: due.length, fresh: fresh.length })
  }

  useEffect(() => {
    void refreshCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, course.id])

  const startBatch = async () => {
    setBusy('batch')
    setErr(null)
    try {
      const session = await createNewStudySession(course.id)
      if (!session) {
        setErr('No cards due and no new FIFO cards in this course. Add or import cards first.')
        return
      }
      onDeckReady(session)
    } finally {
      setBusy('idle')
    }
  }

  const saveManual = async () => {
    const id = db.generateId()
    await db.cards.put({
      id,
      courseId: course.id,
      word: manual.word.trim(),
      definition: manual.definition.trim(),
      hint: manual.hint.trim(),
      example: manual.example.trim(),
      language_code: manual.language_code.trim() || getPronunciationLang(),
      box: 0,
      createdAt: Date.now(),
      nextReviewAt: 0,
      passCount: 0,
      failCount: 0,
    })
    setManualOpen(false)
    setManual({
      word: '',
      definition: '',
      hint: '',
      example: '',
      language_code: getPronunciationLang(),
    })
    await refreshCounts()
    onCardsChanged()
    notify('Card saved.')
  }

  const hasGeminiAuth = Boolean(geminiAuth.apiKey?.trim())

  return (
    <div className="px-4 pb-28 max-w-lg w-full mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-sky-300 px-2 py-1 rounded-lg border border-white/10 hover:bg-white/5"
        >
          ← All courses
        </button>
      </div>

      <div className="glass-panel p-4 space-y-2">
        <p className="text-xs uppercase tracking-widest text-slate-400">Current course</p>
        <p className="text-lg font-semibold text-slate-100">{course.name}</p>
        <p className="text-[11px] text-slate-500">
          Cards and study batches stay inside this course. Switch courses from the list anytime.
        </p>
      </div>

      {pendingRound && (
        <div className="glass-panel p-4 space-y-3 border border-amber-400/25 bg-amber-400/[0.06]">
          <p className="text-xs uppercase tracking-widest text-amber-200/80">Unfinished round</p>
          <p className="text-sm text-slate-200">
            {remainingInPending} card{remainingInPending === 1 ? '' : 's'} left in this batch. Continue where you left
            off, or start over and clear this batch from the queue.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              disabled={busy !== 'idle'}
              className="flex-1 py-2.5 rounded-xl bg-sky-500/90 text-slate-950 text-sm font-semibold disabled:opacity-50"
              onClick={() => onDeckReady(pendingRound)}
            >
              Continue round
            </button>
            <button
              type="button"
              disabled={busy !== 'idle'}
              className="flex-1 py-2.5 rounded-xl border border-white/20 text-slate-200 text-sm disabled:opacity-50"
              onClick={() => {
                clearSession()
                onCardsChanged()
                notify('Round discarded — you can start a new one.')
              }}
            >
              Start over
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Study</p>
            <p className="text-lg font-semibold text-slate-100">Today&apos;s round</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>Due: {counts.due}</div>
            <div>New queue: {counts.fresh}</div>
            <div>Round cap: {roundCap}</div>
          </div>
        </div>
        <button
          type="button"
          disabled={busy !== 'idle'}
          onClick={() => {
            setNotice(null)
            void startBatch()
          }}
          className="w-full py-3 rounded-xl bg-sky-500/90 text-slate-950 font-semibold disabled:opacity-50"
        >
          {busy === 'batch' ? 'Preparing your cards…' : 'Start study round'}
        </button>
        <p className="text-[11px] text-slate-500">
          Builds a mix of due reviews and new cards (import order for new ones). Change round size under Settings.
        </p>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy !== 'idle'}
          className="glass-card py-3 text-sm disabled:opacity-50"
          onClick={() => {
            setManual((m) => ({ ...m, language_code: getPronunciationLang() }))
            setManualOpen(true)
          }}
        >
          Add card
        </button>
        <button
          type="button"
          disabled={busy !== 'idle'}
          className="glass-card py-3 text-sm disabled:opacity-50"
          onClick={() => {
            setNotice(null)
            if (!hasGeminiAuth) {
              onOpenSettings()
              return
            }
            setImportOpen(true)
          }}
        >
          AI import
        </button>
      </div>

      <button
        type="button"
        disabled={busy !== 'idle'}
        className="w-full py-2.5 rounded-xl border border-rose-400/35 text-rose-200/90 text-sm hover:bg-rose-500/10 disabled:opacity-50"
        onClick={() => {
          if (
            !window.confirm(
              `Delete “${course.name}” and all of its cards? This cannot be undone.`,
            )
          )
            return
          void (async () => {
            setBusy('delete')
            try {
              await db.deleteCourseAndCards(course.id)
              onCourseDeleted(course.id)
            } finally {
              setBusy('idle')
            }
          })()
        }}
      >
        {busy === 'delete' ? 'Deleting…' : 'Delete this course'}
      </button>
      {!hasGeminiAuth && (
        <p className="text-[11px] text-amber-200/90 px-0.5">
          AI import needs a Gemini API key — open{' '}
          <button type="button" className="text-sky-300/90 underline" onClick={onOpenSettings}>
            Settings
          </button>{' '}
          or get one from{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-300/90 underline"
          >
            Google AI Studio
          </a>
          .
        </p>
      )}

      {notice && <p className="text-xs text-emerald-300/90 px-1">{notice}</p>}

      <AiImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        geminiAuth={geminiAuth}
        courseId={course.id}
        courseName={course.name}
        onImported={({ added, skippedDuplicate }) => {
          void refreshCounts()
          onCardsChanged()
          setErr(null)
          let msg = `Added ${added} card${added === 1 ? '' : 's'}`
          if (skippedDuplicate > 0) {
            msg += ` (${skippedDuplicate} skipped as duplicates)`
          }
          msg += '.'
          setNotice(msg)
          notify(msg)
        }}
      />

      {manualOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            className="glass-card w-full max-w-md p-4 space-y-2 max-h-[85vh] overflow-y-auto"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              void saveManual()
            }}
          >
            <p className="font-medium">New card in {course.name}</p>
            {(['word', 'definition', 'hint', 'example', 'language_code'] as const).map((k) => (
              <label key={k} className="block text-xs text-slate-400">
                {k}
                <input
                  className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
                  value={manual[k]}
                  onChange={(ev) => setManual((m) => ({ ...m, [k]: ev.target.value }))}
                />
              </label>
            ))}
            <div className="flex gap-2 pt-2">
              <button type="button" className="flex-1 py-2 rounded-lg border border-white/15" onClick={() => setManualOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="flex-1 py-2 rounded-lg bg-sky-500/90 text-slate-950 font-medium">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
