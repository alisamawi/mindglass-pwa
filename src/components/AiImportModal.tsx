import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { db } from '../db'
import type { GeminiAuth, ExtractedTerm, LearningGoal, MindGlassImportContext } from '../lib/gemini'
import { extractTermsFromPlainText, extractVocabularyFromImage } from '../lib/gemini'
import { extractPlainTextFromFile } from '../lib/importFileText'
import { getPronunciationLang } from '../lib/userSettings'
import { shrinkImageForGeminiUpload } from '../lib/shrinkImageForGemini'

const CATEGORIES = [
  { value: 'language', label: 'Language' },
  { value: 'science', label: 'Science' },
  { value: 'coding', label: 'Coding' },
  { value: 'exam', label: 'Exam' },
  { value: 'custom', label: 'Custom' },
] as const

const LEARNING_GOALS: { value: LearningGoal; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'examPrep', label: 'Exam prep' },
]

type ReviewRow = {
  id: string
  selected: boolean
  word: string
  definition: string
  hint: string
  example: string
  language_code: string
  expanded: boolean
}

function buildMindGlass(courseName: string, category: string, focus: string): MindGlassImportContext | null {
  const n = courseName.trim()
  if (!n) return null
  return {
    courseName: n,
    courseCategory: category,
    goalText: focus.trim() || null,
  }
}

function validateCustom(category: string, focus: string): boolean {
  if (category !== 'custom') return true
  return focus.trim().length > 0
}

function termToReviewRow(t: ExtractedTerm, i: number): ReviewRow {
  const fromApi = t.languageCode?.trim()
  const language_code = fromApi
    ? fromApi.toLowerCase().slice(0, 8)
    : getPronunciationLang().toLowerCase().slice(0, 8)
  return {
    id: `r-${i}-${Math.random().toString(36).slice(2, 9)}`,
    selected: true,
    word: t.word,
    definition: t.definition,
    hint: t.hint?.trim() ?? '',
    example: t.example?.trim() ?? '',
    language_code,
    expanded: false,
  }
}

export function AiImportModal({
  open,
  onClose,
  geminiAuth,
  courseId,
  courseName,
  onImported,
}: {
  open: boolean
  onClose: () => void
  geminiAuth: GeminiAuth
  courseId: string
  courseName: string
  onImported: (result: { added: number; skippedDuplicate: number }) => void
}) {
  const [phase, setPhase] = useState<'setup' | 'review'>('setup')
  const [courseNameAi, setCourseNameAi] = useState('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]['value']>('language')
  const [focus, setFocus] = useState('')
  const [learningGoal, setLearningGoal] = useState<LearningGoal>('beginner')
  const [docFile, setDocFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([])
  const [existingKeys, setExistingKeys] = useState<Set<string>>(() => new Set())
  const docInputId = useId()
  const imgInputId = useId()

  const hasAuth = Boolean(geminiAuth.apiKey?.trim())

  const resetExtractInputs = () => {
    setDocFile(null)
    setImageFile(null)
    setStatus(null)
    setErr(null)
  }

  useEffect(() => {
    if (!open) return
    setPhase('setup')
    setReviewRows([])
    setCourseNameAi(courseName)
    setErr(null)
    setStatus(null)
    resetExtractInputs()
  }, [open, courseName])

  const beginReview = useCallback(
    async (terms: ExtractedTerm[]) => {
      const keys = await db.wordKeysInCourse(courseId)
      setExistingKeys(keys)
      setReviewRows(
        terms.map((t, i) => {
          const row = termToReviewRow(t, i)
          const k = row.word.trim().toLowerCase()
          const inDb = Boolean(k && keys.has(k))
          return { ...row, selected: !inDb }
        }),
      )
      setPhase('review')
      setStatus(null)
    },
    [courseId],
  )

  const isDupInCourse = useCallback(
    (word: string) => {
      const k = word.trim().toLowerCase()
      return k.length > 0 && existingKeys.has(k)
    },
    [existingKeys],
  )

  const mindGlassForImage = buildMindGlass(courseNameAi, category, focus)
  const mindGlassForDoc =
    courseNameAi.trim().length > 0 ? buildMindGlass(courseNameAi, category, focus) : null

  const runFromImage = async () => {
    if (!imageFile) {
      setErr('Choose a photo first.')
      return
    }
    if (!validateCustom(category, focus)) {
      setErr('For Custom, describe the course focus below.')
      return
    }
    if (!hasAuth) {
      setErr('Sign in with Google or save a Gemini API key on this device.')
      return
    }
    setBusy(true)
    setErr(null)
    setStatus('Optimizing image size…')
    try {
      const { buffer, mimeType } = await shrinkImageForGeminiUpload(imageFile)
      setStatus('Sending image to cloud AI…')
      const terms = await extractVocabularyFromImage(buffer, mimeType, geminiAuth, mindGlassForImage)
      if (terms.length === 0) {
        setErr('No vocabulary returned. Try a clearer photo.')
        setStatus(null)
        return
      }
      await beginReview(terms)
      resetExtractInputs()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Photo extract failed')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const runFromFile = async () => {
    if (!docFile) {
      setErr('Choose a file first (PDF, DOCX, TXT, CSV, TSV).')
      return
    }
    if (!validateCustom(category, focus)) {
      setErr('For Custom, describe what this course is about.')
      return
    }
    if (!hasAuth) {
      setErr('Sign in with Google or save a Gemini API key on this device.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      setStatus('Reading file…')
      const text = await extractPlainTextFromFile(docFile, (stage, p) => {
        setStatus(p != null ? `${stage} (${Math.round(p * 100)}%)` : stage)
      })
      if (!text.trim()) {
        setErr('No text found in file.')
        setStatus(null)
        return
      }
      const terms = await extractTermsFromPlainText(text, geminiAuth, {
        mindGlass: mindGlassForDoc,
        learningGoal,
        onProgress: (s) => setStatus(s),
      })
      if (terms.length === 0) {
        setErr('No terms extracted. Try a different file or check your key.')
        setStatus(null)
        return
      }
      await beginReview(terms)
      resetExtractInputs()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'File extract failed')
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  const commitReview = async () => {
    const t0 = Date.now()
    let fifoSeq = 0
    const used = new Set<string>()
    let added = 0
    let skippedDuplicate = 0

    for (const row of reviewRows) {
      if (!row.selected) continue
      const k = row.word.trim().toLowerCase()
      if (!k) {
        skippedDuplicate++
        continue
      }
      if (existingKeys.has(k) || used.has(k)) {
        skippedDuplicate++
        continue
      }
      used.add(k)
      await db.cards.add({
        id: db.generateId(),
        courseId,
        word: row.word.trim(),
        definition: row.definition.trim(),
        hint: row.hint.trim(),
        example: row.example.trim(),
        language_code: row.language_code.trim() || getPronunciationLang(),
        box: 0,
        createdAt: t0 + fifoSeq,
        nextReviewAt: 0,
        passCount: 0,
        failCount: 0,
      })
      fifoSeq += 1
      added++
    }

    onImported({ added, skippedDuplicate })
    onClose()
  }

  const selectAllSelectable = () => {
    setReviewRows((rows) =>
      rows.map((r) => ({
        ...r,
        selected: !isDupInCourse(r.word),
      })),
    )
  }

  const deselectAll = () => {
    setReviewRows((rows) => rows.map((r) => ({ ...r, selected: false })))
  }

  const addableCount = useMemo(() => {
    const used = new Set<string>()
    let n = 0
    for (const r of reviewRows) {
      if (!r.selected) continue
      const k = r.word.trim().toLowerCase()
      if (!k) continue
      if (existingKeys.has(k) || used.has(k)) continue
      used.add(k)
      n++
    }
    return n
  }, [reviewRows, existingKeys])

  if (!open) return null

  const dupInBatch = (row: ReviewRow) => {
    const k = row.word.trim().toLowerCase()
    if (!k) return false
    const selectedSame = reviewRows.filter((r) => r.selected && r.word.trim().toLowerCase() === k)
    return selectedSame.length > 1
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-4 space-y-3 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-medium text-slate-100">
              {phase === 'setup' ? 'Import with AI' : 'Review imports'}
            </p>
            <p className="text-[11px] text-sky-300/90 mt-0.5">
              Target course: <span className="text-slate-200">{courseName}</span>
            </p>
          </div>
          <button
            type="button"
            className="text-slate-400 text-sm px-2 shrink-0"
            onClick={() => {
              resetExtractInputs()
              onClose()
            }}
          >
            Close
          </button>
        </div>

        {phase === 'setup' && (
          <>
            <p className="text-[11px] text-slate-500">
              Extract cards from a file or photo, then review and pick what to add. Words that already exist in
              this course are flagged and won&apos;t be added twice.
            </p>

            <label className="block text-xs text-slate-400">
              Context name (for AI — usually your course title)
              <input
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
                value={courseNameAi}
                onChange={(e) => setCourseNameAi(e.target.value)}
                placeholder="e.g. Swedish A1"
                disabled={busy}
              />
            </label>

            <label className="block text-xs text-slate-400">
              Category
              <select
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number]['value'])}
                disabled={busy}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs text-slate-400">
              {category === 'custom' ? 'Course focus (required for Custom)' : 'Focus / goal (optional)'}
              <textarea
                className="mt-1 w-full min-h-[52px] rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                disabled={busy}
              />
            </label>

            <label className="block text-xs text-slate-400">
              Learning depth (file / prose only)
              <select
                className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
                value={learningGoal}
                onChange={(e) => setLearningGoal(e.target.value as LearningGoal)}
                disabled={busy}
              >
                {LEARNING_GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="border border-white/10 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-slate-300">From file</p>
              <p className="text-[10px] text-slate-500">
                PDF, Word, or plain text — not photos. For pictures, use <strong>From photo</strong> below.
              </p>
              <input
                id={docInputId}
                type="file"
                accept=".pdf,.docx,.txt,.csv,.tsv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,text/tab-separated-values"
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setDocFile(f)
                  setErr(null)
                  e.target.value = ''
                }}
              />
              <div className="flex flex-wrap gap-2 items-center">
                {busy ? (
                  <span className="px-3 py-2 rounded-lg bg-white/10 text-xs opacity-50 pointer-events-none">
                    Choose file
                  </span>
                ) : (
                  <label
                    htmlFor={docInputId}
                    className="px-3 py-2 rounded-lg bg-white/10 text-xs cursor-pointer hover:bg-white/[0.14] transition inline-block"
                  >
                    Choose file
                  </label>
                )}
                {docFile && (
                  <span className="text-[11px] text-slate-400 truncate max-w-[200px]">{docFile.name}</span>
                )}
              </div>
              <button
                type="button"
                disabled={busy || !docFile}
                className="w-full py-2 rounded-lg bg-sky-500/90 text-slate-950 text-sm font-medium disabled:opacity-50"
                onClick={() => void runFromFile()}
              >
                {busy && docFile ? '…' : 'Extract from file'}
              </button>
            </div>

            <div className="border border-white/10 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-slate-300">From photo</p>
              <p className="text-[10px] text-slate-500">
                Large photos are resized in the browser before upload to stay within Gemini free-tier limits.
              </p>
              <input
                id={imgInputId}
                type="file"
                accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif,image/heic"
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setImageFile(f)
                  setErr(null)
                  e.target.value = ''
                }}
              />
              <div className="flex flex-wrap gap-2 items-center">
                {busy ? (
                  <span className="px-3 py-2 rounded-lg bg-white/10 text-xs opacity-50 pointer-events-none">
                    {/iPhone|iPad|Android/i.test(navigator.userAgent) ? 'Camera / gallery' : 'Choose image'}
                  </span>
                ) : (
                  <label
                    htmlFor={imgInputId}
                    className="px-3 py-2 rounded-lg bg-white/10 text-xs cursor-pointer hover:bg-white/[0.14] transition inline-block"
                  >
                    {/iPhone|iPad|Android/i.test(navigator.userAgent) ? 'Camera / gallery' : 'Choose image'}
                  </label>
                )}
                {imageFile && (
                  <span className="text-[11px] text-slate-400 truncate max-w-[200px]">{imageFile.name}</span>
                )}
              </div>
              <button
                type="button"
                disabled={busy || !imageFile}
                className="w-full py-2 rounded-lg bg-violet-500/90 text-slate-950 text-sm font-medium disabled:opacity-50"
                onClick={() => void runFromImage()}
              >
                {busy && imageFile ? '…' : 'Extract from photo'}
              </button>
            </div>
          </>
        )}

        {phase === 'review' && (
          <>
            <p className="text-[11px] text-slate-500">
              Toggle cards to import, expand a row to edit. Duplicates already in <strong>{courseName}</strong> are
              marked; only new terms are counted in &quot;Add&quot;.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-2 py-1.5 rounded-lg bg-white/10 text-[11px]"
                onClick={selectAllSelectable}
              >
                Select new only
              </button>
              <button type="button" className="px-2 py-1.5 rounded-lg border border-white/15 text-[11px]" onClick={deselectAll}>
                Deselect all
              </button>
              <button
                type="button"
                className="px-2 py-1.5 rounded-lg border border-white/15 text-[11px]"
                onClick={() => {
                  setPhase('setup')
                  setReviewRows([])
                }}
              >
                ← Back to extract
              </button>
            </div>

            <ul className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
              {reviewRows.map((row, idx) => {
                const dupDb = isDupInCourse(row.word)
                const dupBatch = dupInBatch(row)
                const bad = dupDb || dupBatch
                return (
                  <li
                    key={row.id}
                    className={`rounded-xl border p-2 text-sm ${
                      bad ? 'border-amber-500/40 bg-amber-500/[0.07]' : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-white/20"
                        checked={row.selected}
                        onChange={(e) => {
                          const on = e.target.checked
                          setReviewRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, selected: on } : r)))
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-slate-100 truncate">{row.word || '(empty term)'}</span>
                          <button
                            type="button"
                            className="text-[10px] text-sky-300 shrink-0"
                            onClick={() =>
                              setReviewRows((rs) =>
                                rs.map((r) => (r.id === row.id ? { ...r, expanded: !r.expanded } : r)),
                              )
                            }
                          >
                            {row.expanded ? 'Collapse' : 'Edit'}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2">{row.definition}</p>
                        {dupDb && (
                          <p className="text-[10px] text-amber-200 mt-1">Already in this course — won&apos;t import.</p>
                        )}
                        {dupBatch && !dupDb && (
                          <p className="text-[10px] text-amber-200/90 mt-1">Duplicate in this list — first kept.</p>
                        )}
                        {row.expanded && (
                          <div className="mt-2 space-y-2 pt-2 border-t border-white/10">
                            {(['word', 'definition', 'hint', 'example', 'language_code'] as const).map((field) => (
                              <label key={field} className="block text-[10px] text-slate-500">
                                {field}
                                <input
                                  className="mt-0.5 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-slate-100"
                                  value={row[field]}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    setReviewRows((rs) =>
                                      rs.map((r, j) => (j === idx ? { ...r, [field]: v } : r)),
                                    )
                                  }}
                                />
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            <button
              type="button"
              className="w-full py-3 rounded-xl bg-emerald-500/90 text-slate-950 font-semibold disabled:opacity-50"
              disabled={addableCount === 0}
              onClick={() => void commitReview()}
            >
              Add {addableCount} card{addableCount === 1 ? '' : 's'} to {courseName}
            </button>
          </>
        )}

        {status && phase === 'setup' && <p className="text-[11px] text-slate-400">{status}</p>}
        {err && <p className="text-xs text-rose-300">{err}</p>}
      </div>
    </div>
  )
}
