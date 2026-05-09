import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { FlashCard } from '../db'
import { db } from '../db'
import { applyFail, applyPass } from '../lib/liteck'
import { saveSession, type PersistedSession } from '../lib/sessionStorage'
import { resolveSpeechLangForCard } from '../lib/userSettings'
import { speakTerm, stopSpeaking } from '../lib/speech'

/** Flutter: flip AnimationController duration milliseconds: 420 */
const FLIP_DURATION_S = 0.42
/** Card flies off-screen after commit */
const SWIPE_OUT_DURATION_S = 0.22
/** Flutter CardSwiper-style: distance or velocity completes the swipe */
const SWIPE_DISTANCE_MIN = 88
const VELOCITY_THRESHOLD = 420

function swipeThresholdPx(): number {
  if (typeof window === 'undefined') return 110
  return Math.max(SWIPE_DISTANCE_MIN, Math.min(160, window.innerWidth * 0.22))
}

function swipeOffscreenDistance(): number {
  if (typeof window === 'undefined') return 480
  return Math.max(420, window.innerWidth * 1.05)
}

export function LiquidStudy({
  deck,
  session,
  onPersistSession,
  onClose,
  onBatchComplete,
}: {
  deck: FlashCard[]
  session: PersistedSession
  onPersistSession: (s: PersistedSession) => void
  onClose: () => void
  onBatchComplete: () => void
}) {
  const [idx, setIdx] = useState(session.currentIndex)
  const [face, setFace] = useState<'front' | 'back'>('front')
  const [hintOpen, setHintOpen] = useState(false)
  const [exiting, setExiting] = useState(false)
  const flipLock = useRef(false)

  const x = useMotionValue(0)
  const tilt = useTransform(x, [-260, 260], [-11, 11])
  const passGlow = useTransform(x, [0, 24, 140], [0, 0.12, 0.38])
  const failGlow = useTransform(x, [-140, -24, 0], [0.38, 0.12, 0])

  const card = deck[idx]
  const prog = useMemo(() => `${Math.min(idx + 1, deck.length)} / ${deck.length}`, [deck.length, idx])

  const dragLimit = useMemo(() => {
    if (typeof window === 'undefined') return 300
    return Math.min(340, Math.max(240, window.innerWidth * 0.42))
  }, [])

  useEffect(() => {
    setIdx(session.currentIndex)
    setFace('front')
    setHintOpen(false)
    x.set(0)
    setExiting(false)
  }, [session.batchKey, session.currentIndex, x])

  useEffect(() => () => {
    stopSpeaking()
  }, [])

  useEffect(() => {
    setHintOpen(false)
    setFace('front')
    stopSpeaking()
  }, [card?.id])

  const persist = useCallback(
    (nextIdx: number) => {
      const s: PersistedSession = { ...session, currentIndex: nextIdx }
      onPersistSession(s)
      saveSession(s)
    },
    [onPersistSession, session],
  )

  const finalize = useCallback(
    async (pass: boolean) => {
      const now = Date.now()
      if (!card) return
      const nextCard = pass ? applyPass(card, now) : applyFail(card, now)
      await db.cards.put(nextCard)
      const nextIdx = idx + 1
      if (nextIdx >= deck.length) {
        onBatchComplete()
        onClose()
        return
      }
      persist(nextIdx)
      setFace('front')
      x.set(0)
      setIdx(nextIdx)
    },
    [card, deck.length, idx, onBatchComplete, onClose, persist, x],
  )

  const swipeAway = useCallback(
    async (pass: boolean) => {
      if (!card || exiting) return
      setExiting(true)
      const target = pass ? swipeOffscreenDistance() : -swipeOffscreenDistance()
      try {
        await animate(x, target, { duration: SWIPE_OUT_DURATION_S, ease: [0.22, 1, 0.36, 1] })
        await finalize(pass)
      } finally {
        setExiting(false)
      }
    },
    [card, exiting, finalize, x],
  )

  const onDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
      if (exiting) return
      const ox = info.offset.x
      const vx = info.velocity.x
      const th = swipeThresholdPx()
      if (ox > th || vx > VELOCITY_THRESHOLD) {
        void swipeAway(true)
      } else if (ox < -th || vx < -VELOCITY_THRESHOLD) {
        void swipeAway(false)
      } else {
        void animate(x, 0, { type: 'spring', stiffness: 520, damping: 38, mass: 0.85 })
      }
    },
    [exiting, swipeAway, x],
  )

  const toggleFlip = useCallback(() => {
    if (exiting || flipLock.current) return
    flipLock.current = true
    setFace((f) => (f === 'front' ? 'back' : 'front'))
    window.setTimeout(() => {
      flipLock.current = false
    }, FLIP_DURATION_S * 1000)
  }, [exiting])

  const tryFlipFromCardFace = useCallback(
    (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('button, a, [data-no-flip]')) return
      toggleFlip()
    },
    [toggleFlip],
  )

  const requestHint = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setHintOpen(true)
  }, [])

  const playPronunciation = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const w = card?.word?.trim()
      if (!w) return
      const lang = resolveSpeechLangForCard(card?.language_code)
      speakTerm(w, lang)
    },
    [card?.word, card?.language_code],
  )

  if (!card) return null

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0 bg-slate-950/80"
        aria-hidden
        initial={{ backdropFilter: 'blur(0px)' }}
        animate={{ backdropFilter: 'blur(22px)' }}
      />
      <div className="relative flex-1 flex flex-col items-center px-4 pb-10 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <header className="w-full max-w-lg flex items-center justify-between mb-4 mt-2">
          <button type="button" className="text-sm text-slate-400" onClick={onClose}>
            Exit
          </button>
          <span className="text-xs tracking-widest uppercase text-sky-200/80">Deep focus</span>
          <span className="text-xs text-slate-400">{prog}</span>
        </header>

        <motion.div
          key={card.id}
          drag={exiting ? false : 'x'}
          dragElastic={0.14}
          dragConstraints={{ left: -dragLimit, right: dragLimit }}
          dragMomentum={false}
          style={{ x, rotate: tilt }}
          onDragEnd={onDragEnd}
          whileTap={exiting ? undefined : { scale: 0.998 }}
          className="relative w-full max-w-md cursor-grab active:cursor-grabbing touch-pan-y select-none"
        >
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-3xl pointer-events-none z-30"
            style={{
              opacity: passGlow,
              boxShadow: '0 0 52px rgba(76, 175, 80, 0.55)',
              background: 'rgba(76, 175, 80, 0.06)',
            }}
          />
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-3xl pointer-events-none z-30"
            style={{
              opacity: failGlow,
              boxShadow: '0 0 52px rgba(229, 115, 115, 0.55)',
              background: 'rgba(229, 115, 115, 0.07)',
            }}
          />

          <div
            className="relative w-full [perspective:850px]"
            style={{ perspectiveOrigin: '50% 50%' }}
          >
            <motion.div
              className="relative w-full"
              style={{ transformStyle: 'preserve-3d' }}
              initial={false}
              animate={{ rotateY: face === 'back' ? 180 : 0 }}
              transition={{ duration: FLIP_DURATION_S, ease: [0.4, 0, 0.2, 1] }}
            >
              <div
                className="glass-card px-6 py-8 min-h-[320px] flex flex-col justify-between relative overflow-hidden [backface-visibility:hidden]"
                style={{ WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)' }}
                role="presentation"
                onClick={tryFlipFromCardFace}
              >
                <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,rgba(56,189,248,0.55),transparent_55%)]" />

                <div className="relative space-y-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">
                    {card.language_code} · box {card.box + 1}
                  </p>
                  <div className="flex flex-col items-center gap-3">
                    <h3 className="text-2xl md:text-3xl font-semibold text-glow text-center px-2">{card.word}</h3>
                    <button
                      type="button"
                      data-no-flip
                      disabled={exiting || !card.word?.trim()}
                      className="text-xs font-medium text-violet-300/95 hover:text-violet-200 disabled:opacity-40 relative z-20 rounded-lg border border-violet-400/35 px-3 py-1.5"
                      onClick={playPronunciation}
                    >
                      Listen
                    </button>
                  </div>
                  {!hintOpen ? (
                    <button
                      type="button"
                      data-no-flip
                      className="text-xs text-sky-300 underline relative z-20"
                      onClick={requestHint}
                    >
                      Need a hint?
                    </button>
                  ) : (
                    <p className="text-sm text-sky-100/90 relative z-20 text-center px-1">{card.hint || '—'}</p>
                  )}
                  <p className="text-xs text-slate-400 text-center">Tap card · swipe right pass · left again</p>
                </div>
              </div>

              <div
                className="glass-card absolute inset-0 px-6 py-8 min-h-[320px] flex flex-col justify-center overflow-hidden [backface-visibility:hidden]"
                style={{
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg)',
                }}
                role="presentation"
                onClick={tryFlipFromCardFace}
              >
                <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_50%_80%,rgba(167,139,250,0.45),transparent_55%)]" />
                <div className="relative w-full space-y-4 flex flex-col items-center text-center">
                  <p className="text-sm leading-relaxed text-slate-100">{card.definition}</p>
                  <p className="text-xs text-slate-400 italic">{card.example}</p>
                  <p className="text-xs text-slate-500">Tap to flip back</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <p className="mt-5 text-center text-[11px] text-slate-500 max-w-md px-2">
          ← Again &nbsp;&nbsp; Remember →
          <br />
          <span className="text-slate-600">(tap the term to see the back)</span>
        </p>

        <div className="mt-6 flex justify-between w-full max-w-md gap-4">
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            disabled={exiting}
            className="flex-1 py-3 rounded-xl bg-rose-500/25 border border-rose-400/40 text-rose-50 text-sm font-semibold disabled:opacity-50"
            onClick={() => void swipeAway(false)}
          >
            Again
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            disabled={exiting}
            className="flex-1 py-3 rounded-xl bg-emerald-500/25 border border-emerald-400/40 text-emerald-50 text-sm font-semibold disabled:opacity-50"
            onClick={() => void swipeAway(true)}
          >
            Remember
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
