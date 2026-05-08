import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import { BATCH_SIZE } from '../lib/batch'
import { extractFromImageBase64, extractFromText } from '../lib/gemini'
import { createNewStudySession } from '../lib/startStudyBatch'
import type { PersistedSession } from '../lib/sessionStorage'
import { useAuth } from '../context/AuthContext'

export function StudyLab({
  onDeckReady,
  refreshTick,
  onCardsChanged,
}: {
  onDeckReady: (session: PersistedSession) => void
  refreshTick: number
  onCardsChanged: () => void
}) {
  const auth = useAuth()
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() || null
  const geminiAuth = useMemo(
    () => ({
      accessToken: auth.googleAccessToken,
      apiKey,
    }),
    [auth.googleAccessToken, apiKey],
  )

  const [busy, setBusy] = useState<'idle' | 'batch' | 'ai'>('idle')
  const [error, setErr] = useState<string | null>(null)

  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState({
    word: '',
    definition: '',
    hint: '',
    example: '',
    language_code: 'en',
  })

  const [extractOpen, setExtractOpen] = useState(false)
  const [paste, setPaste] = useState('')
  const [imgFile, setImgFile] = useState<File | null>(null)

  const [counts, setCountsState] = useState({ due: 0, fresh: 0 })

  const refreshCounts = async () => {
    const now = Date.now()
    const due = await db.dueFifo(now)
    const fresh = await db.unintroducedFifo()
    setCountsState({ due: due.length, fresh: fresh.length })
  }

  useEffect(() => {
    void refreshCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  const startBatch = async () => {
    setBusy('batch')
    setErr(null)
    try {
      const session = await createNewStudySession()
      if (!session) {
        setErr('No cards due and no new FIFO cards. Add content first.')
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
      word: manual.word.trim(),
      definition: manual.definition.trim(),
      hint: manual.hint.trim(),
      example: manual.example.trim(),
      language_code: manual.language_code.trim() || 'en',
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
      language_code: 'en',
    })
    await refreshCounts()
    onCardsChanged()
  }

  const runExtract = async () => {
    setBusy('ai')
    setErr(null)
    try {
      const data = imgFile
        ? await extractFromImageBase64(
            imgFile.type || 'image/jpeg',
            await fileToB64(imgFile),
            paste,
            geminiAuth,
          )
        : await extractFromText(paste, geminiAuth)
      const id = db.generateId()
      await db.cards.put({
        id,
        word: data.word,
        definition: data.definition,
        hint: data.hint,
        example: data.example,
        language_code: data.language_code || 'en',
        box: 0,
        createdAt: Date.now(),
        nextReviewAt: 0,
        passCount: 0,
        failCount: 0,
      })
      setExtractOpen(false)
      setPaste('')
      setImgFile(null)
      await refreshCounts()
      onCardsChanged()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Extract failed')
    } finally {
      setBusy('idle')
    }
  }

  return (
    <div className="px-4 pb-28 max-w-lg w-full mx-auto space-y-4">
      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-400">Today</p>
            <p className="text-lg font-semibold text-slate-100">Study Lab</p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>Due: {counts.due}</div>
            <div>FIFO new: {counts.fresh}</div>
            <div>Batch cap: {BATCH_SIZE}</div>
          </div>
        </div>
        <button
          type="button"
          disabled={busy !== 'idle'}
          onClick={() => void startBatch()}
          className="w-full py-3 rounded-xl bg-sky-500/90 text-slate-950 font-semibold disabled:opacity-50"
        >
          {busy === 'batch' ? 'Building…' : 'Build daily batch & study'}
        </button>
        {error && <p className="text-xs text-rose-300">{error}</p>}
      </div>

      <div className="glass-panel p-4 space-y-2">
        <p className="text-sm font-medium text-slate-200">Identity & Gemini</p>
        {!auth.firebaseOk && (
          <p className="text-xs text-amber-200/90">
            Firebase env missing — Google sign-in disabled. Manual cards still work. Optional:{' '}
            <code className="text-[10px]">VITE_GEMINI_API_KEY</code> for AI extract.
          </p>
        )}
        {auth.firebaseOk && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-lg bg-white/10 text-xs"
              onClick={() => void auth.signInGoogle()}
              disabled={auth.busy}
            >
              {auth.user ? 'Refresh Google session' : 'Sign in with Google'}
            </button>
            {auth.user && (
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-white/15 text-xs"
                onClick={() => void auth.signOutApp()}
                disabled={auth.busy}
              >
                Sign out
              </button>
            )}
          </div>
        )}
        {auth.user && (
          <p className="text-[11px] text-slate-500 truncate">{auth.user.email}</p>
        )}
        {auth.error && <p className="text-xs text-rose-300">{auth.error}</p>}
        <p className="text-[11px] text-slate-500">
          OAuth access token is sent as <code className="text-[10px]">Authorization: Bearer</code> (when Cloud
          IAM allows). Dev fallback: <code className="text-[10px]">VITE_GEMINI_API_KEY</code>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          className="glass-card py-3 text-sm"
          onClick={() => setManualOpen(true)}
        >
          Add card
        </button>
        <button
          type="button"
          className="glass-card py-3 text-sm"
          onClick={() => setExtractOpen(true)}
        >
          AI extract
        </button>
      </div>

      {manualOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            className="glass-card w-full max-w-md p-4 space-y-2 max-h-[85vh] overflow-y-auto"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              void saveManual()
            }}
          >
            <p className="font-medium">New card</p>
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

      {extractOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-4 space-y-3 max-h-[85vh] overflow-y-auto">
            <p className="font-medium">Gemini extract</p>
            <textarea
              className="w-full min-h-[100px] rounded-lg bg-white/5 border border-white/10 p-2 text-sm"
              placeholder="Paste text (optional if you attach an image)"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImgFile(e.target.files?.[0] ?? null)}
            />
            {!auth.googleAccessToken && !apiKey && (
              <p className="text-xs text-amber-200">Sign in with Google or set VITE_GEMINI_API_KEY.</p>
            )}
            <div className="flex gap-2">
              <button type="button" className="flex-1 py-2 rounded-lg border border-white/15" onClick={() => setExtractOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === 'ai' || (!paste.trim() && !imgFile)}
                className="flex-1 py-2 rounded-lg bg-violet-500/90 text-slate-950 font-medium disabled:opacity-50"
                onClick={() => void runExtract()}
              >
                {busy === 'ai' ? '…' : 'Run'}
              </button>
            </div>
            {error && <p className="text-xs text-rose-300">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

async function fileToB64(f: File): Promise<string> {
  const buf = await f.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
