import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useNotify } from '../context/NotifyContext'
import { isStandalonePwa } from '../lib/pwaEnvironment'
import {
  DEFAULT_CARDS_PER_ROUND,
  DEFAULT_PRONUNCIATION_LANG,
  getCardsPerRound,
  getPronunciationLang,
  MAX_CARDS_PER_ROUND,
  MIN_CARDS_PER_ROUND,
  setCardsPerRound,
  setPronunciationLang,
} from '../lib/userSettings'

const AI_STUDIO_KEYS_URL = 'https://aistudio.google.com/apikey'

const CUSTOM_LANG = '__custom__'

const PRESET_SPEECH_LANG: { value: string; label: string }[] = [
  { value: 'en-US', label: 'English (United States)' },
  { value: 'en-GB', label: 'English (United Kingdom)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'es-MX', label: 'Spanish (Mexico)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'it-IT', label: 'Italian (Italy)' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'pt-PT', label: 'Portuguese (Portugal)' },
  { value: 'sv-SE', label: 'Swedish' },
  { value: 'no-NO', label: 'Norwegian' },
  { value: 'da-DK', label: 'Danish' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'pl-PL', label: 'Polish' },
  { value: 'ru-RU', label: 'Russian' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'ar-SA', label: 'Arabic (Saudi Arabia)' },
  { value: 'hi-IN', label: 'Hindi (India)' },
]

function isPresetCode(code: string): boolean {
  return PRESET_SPEECH_LANG.some((p) => p.value === code)
}

export function Settings({
  manualKey,
  setManualKey,
  onSettingsChanged,
  onRequestInstallGuide,
}: {
  manualKey: string | null
  setManualKey: (key: string | null) => void
  onSettingsChanged?: () => void
  onRequestInstallGuide?: () => void
}) {
  const notify = useNotify()
  const [perRoundDraft, setPerRoundDraft] = useState(String(getCardsPerRound()))
  const [langSelect, setLangSelect] = useState(() => {
    const cur = getPronunciationLang()
    return isPresetCode(cur) ? cur : CUSTOM_LANG
  })
  const [langCustom, setLangCustom] = useState(() => {
    const cur = getPronunciationLang()
    return isPresetCode(cur) ? '' : cur
  })
  const [keyDraft, setKeyDraft] = useState('')
  const [keyOpen, setKeyOpen] = useState(false)

  const envGeminiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() || ''
  const hasApiKey = useMemo(
    () => Boolean(manualKey?.trim() || envGeminiKey),
    [manualKey, envGeminiKey],
  )

  useEffect(() => {
    setPerRoundDraft(String(getCardsPerRound()))
    const cur = getPronunciationLang()
    if (isPresetCode(cur)) {
      setLangSelect(cur)
      setLangCustom('')
    } else {
      setLangSelect(CUSTOM_LANG)
      setLangCustom(cur)
    }
  }, [])

  const applyCardsPerRound = () => {
    const n = Number.parseInt(perRoundDraft, 10)
    if (Number.isFinite(n)) {
      setCardsPerRound(n)
      setPerRoundDraft(String(getCardsPerRound()))
    } else {
      setPerRoundDraft(String(getCardsPerRound()))
    }
    notify('Study round size saved.')
    onSettingsChanged?.()
  }

  const submitCards = (e: FormEvent) => {
    e.preventDefault()
    applyCardsPerRound()
  }

  const applySpeechLang = () => {
    const tag =
      langSelect === CUSTOM_LANG
        ? langCustom.trim() || DEFAULT_PRONUNCIATION_LANG
        : langSelect
    setPronunciationLang(tag)
    const saved = getPronunciationLang()
    if (isPresetCode(saved)) {
      setLangSelect(saved)
      setLangCustom('')
    } else {
      setLangSelect(CUSTOM_LANG)
      setLangCustom(saved)
    }
    notify('Speech language saved.')
    onSettingsChanged?.()
  }

  return (
    <div className="px-4 pb-28 max-w-lg w-full mx-auto space-y-4">
      {!isStandalonePwa() && onRequestInstallGuide && (
        <div className="glass-panel p-4 space-y-3">
          <p className="text-xs uppercase tracking-widest text-slate-400">Install</p>
          <p className="text-lg font-semibold text-slate-100">Add to Home Screen</p>
          <p className="text-[11px] text-slate-500">
            MindGlass runs in the browser and can be pinned like an app. iPhone doesn’t allow an automatic install popup —
            open these steps anytime.
          </p>
          <button
            type="button"
            className="w-full py-3 rounded-xl bg-sky-500/90 text-slate-950 text-sm font-semibold"
            onClick={onRequestInstallGuide}
          >
            Show how to install
          </button>
        </div>
      )}

      <div className="glass-panel p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-slate-400">Study rounds</p>
        <p className="text-lg font-semibold text-slate-100">Cards per study round</p>
        <p className="text-[11px] text-slate-500">
          Each round mixes due reviews and new cards (FIFO) up to this limit. Default is {DEFAULT_CARDS_PER_ROUND}.
        </p>
        <form onSubmit={submitCards} className="flex flex-wrap items-end gap-2 pt-1">
          <label className="flex-1 min-w-[8rem] text-xs text-slate-400">
            Words / cards
            <input
              type="number"
              min={MIN_CARDS_PER_ROUND}
              max={MAX_CARDS_PER_ROUND}
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
              value={perRoundDraft}
              onChange={(e) => setPerRoundDraft(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-sky-500/90 text-slate-950 text-sm font-medium shrink-0"
          >
            Save
          </button>
        </form>
        <p className="text-[10px] text-slate-600">
          Allowed range {MIN_CARDS_PER_ROUND}–{MAX_CARDS_PER_ROUND}.
        </p>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-slate-400">Pronunciation</p>
        <p className="text-lg font-semibold text-slate-100">Speech language</p>
        <p className="text-[11px] text-slate-500">
          Default voice for the &quot;Listen&quot; button when a card has no language tag, and for cards still tagged{' '}
          <code className="text-[10px] text-slate-400">en</code> while your setting here is not English (common after import). Otherwise each
          card&apos;s <code className="text-[10px] text-slate-400">language_code</code> is used. New cards and AI import use this when the model
          leaves language blank.
        </p>
        <label className="block text-xs text-slate-400">
          Language
          <select
            className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
            value={langSelect}
            onChange={(e) => {
              const v = e.target.value
              setLangSelect(v)
              if (v !== CUSTOM_LANG) {
                setLangCustom('')
              } else {
                const cur = getPronunciationLang()
                setLangCustom(isPresetCode(cur) ? '' : cur)
              }
            }}
          >
            {PRESET_SPEECH_LANG.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} — {p.value}
              </option>
            ))}
            <option value={CUSTOM_LANG}>Custom BCP-47 tag…</option>
          </select>
        </label>
        {langSelect === CUSTOM_LANG && (
          <label className="block text-xs text-slate-400">
            Custom tag
            <input
              className="mt-1 w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
              value={langCustom}
              onChange={(e) => setLangCustom(e.target.value)}
              placeholder={DEFAULT_PRONUNCIATION_LANG}
            />
          </label>
        )}
        <button type="button" className="px-4 py-2 rounded-lg bg-white/10 text-sm" onClick={applySpeechLang}>
          Save language
        </button>
      </div>

      <div className="glass-panel p-4 space-y-3">
        <p className="text-sm font-medium text-slate-200">AI import</p>
        <p className="text-[11px] text-slate-500">
          AI import uses the Gemini API with the same default model as the MindGlass Flutter app:{' '}
          <code className="text-[10px] text-slate-400">gemini-2.5-flash-lite</code> for both text and photo (vision). Large photos are
          resized before upload to reduce token use. Optional env: <code className="text-[10px] text-slate-400">VITE_GEMINI_MODEL</code>,{' '}
          <code className="text-[10px] text-slate-400">VITE_GEMINI_IMAGE_MODEL</code>. If you see quota (429) on the free tier, try a
          smaller import, wait for the limit to reset, or{' '}
          <a
            href="https://ai.google.dev/gemini-api/docs/rate-limits"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-300/90 underline underline-offset-2"
          >
            check billing / limits
          </a>
          . Create a key in{' '}
          <a
            href={AI_STUDIO_KEYS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-300/90 underline underline-offset-2"
          >
            Google AI Studio
          </a>
          , then paste it below. It is stored only in this browser. Optional build-time{' '}
          <code className="text-[10px] text-slate-400">VITE_GEMINI_API_KEY</code> is used if you do not set a key here.
        </p>

        {!hasApiKey && (
          <p className="text-xs text-amber-200/90 rounded-lg border border-amber-400/25 bg-amber-400/5 px-3 py-2">
            No Gemini key yet — open{' '}
            <a
              href={AI_STUDIO_KEYS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 underline underline-offset-2"
            >
              Google AI Studio → Get API key
            </a>
            , copy the key, then expand &quot;Gemini API key&quot; and save it here.
          </p>
        )}

        <button
          type="button"
          className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-sm font-medium text-slate-100 hover:bg-white/[0.07] transition"
          onClick={() => {
            setKeyDraft(manualKey ?? '')
            setKeyOpen((o) => !o)
          }}
        >
          <span>Gemini API key</span>
          <span className="text-slate-500 text-xs shrink-0">{keyOpen ? '▾' : '▸'}</span>
        </button>

        {keyOpen && (
          <div className="space-y-2 pt-1">
            <p className="text-[11px] text-slate-500">Stored in your browser only. Overrides build env when set.</p>
            <input
              type="password"
              autoComplete="off"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-2 py-2 text-sm text-slate-100"
              placeholder="AIza…"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 py-2 rounded-lg bg-violet-500/80 text-slate-950 text-xs font-medium"
                onClick={() => {
                  setManualKey(keyDraft.trim() || null)
                  setKeyOpen(false)
                  notify(keyDraft.trim() ? 'Gemini API key saved.' : 'Gemini API key cleared.')
                  onSettingsChanged?.()
                }}
              >
                Save key
              </button>
              <button
                type="button"
                className="flex-1 py-2 rounded-lg border border-white/15 text-xs"
                onClick={() => {
                  setManualKey(null)
                  setKeyDraft('')
                  notify('Gemini API key cleared.')
                  onSettingsChanged?.()
                }}
              >
                Clear
              </button>
            </div>
          </div>
        )}
        {manualKey && !keyOpen && (
          <p className="text-[11px] text-emerald-400/90">Gemini key saved on this device.</p>
        )}
        {!manualKey && envGeminiKey && !keyOpen && (
          <p className="text-[11px] text-slate-500">Using Gemini key from this app&apos;s build configuration.</p>
        )}
      </div>
    </div>
  )
}
