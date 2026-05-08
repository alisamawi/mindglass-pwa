import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FlashCard } from '../db'
import { db } from '../db'
import { applyFail, applyPass } from '../lib/liteck'
import { saveSession, type PersistedSession } from '../lib/sessionStorage'

const SWIPE = 96

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
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-12, 12])

  const card = deck[idx]
  const prog = useMemo(() => `${Math.min(idx + 1, deck.length)} / ${deck.length}`, [deck.length, idx])

  useEffect(() => {
    setIdx(session.currentIndex)
    setFace('front')
    setHintOpen(false)
    x.set(0)
  }, [session.batchKey, session.currentIndex, x])

  useEffect(() => {
    setHintOpen(false)
    setFace('front')
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

  const onDragEnd = useCallback(
    (_: unknown, info: { offset: { x: number } }) => {
      const ox = info.offset.x
      if (ox > SWIPE) void finalize(true)
      else if (ox < -SWIPE) void finalize(false)
      else void animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 })
    },
    [finalize, x],
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

        <AnimatePresence mode="wait">
          <motion.div
            key={card.id}
            drag="x"
            dragElastic={0.85}
            dragConstraints={{ left: 0, right: 0 }}
            dragMomentum={false}
            style={{ x, rotate }}
            onDragEnd={onDragEnd}
            whileTap={{ scale: 0.997 }}
            className="w-full max-w-md cursor-grab active:cursor-grabbing"
          >
            <motion.div
              layout
              className="glass-card px-6 py-8 min-h-[320px] flex flex-col justify-between relative overflow-hidden"
              animate={{
                boxShadow: [
                  '0 24px 80px rgba(56,189,248,0.14)',
                  '0 28px 96px rgba(167,139,250,0.35)',
                  '0 24px 80px rgba(56,189,248,0.14)',
                ],
              }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              onClick={() => setFace(face === 'front' ? 'back' : 'front')}
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') setFace(face === 'front' ? 'back' : 'front')
              }}
            >
              <div className="absolute inset-0 opacity-30 pointer-events-none bg-[radial-gradient(circle_at_50%_20%,rgba(56,189,248,0.55),transparent_55%)]" />

              {face === 'front' ? (
                <div className="relative space-y-4">
                  <p className="text-xs uppercase tracking-widest text-slate-400">
                    {card.language_code} · box {card.box + 1}
                  </p>
                  <h3 className="text-2xl md:text-3xl font-semibold text-glow">{card.word}</h3>
                  {!hintOpen ? (
                    <button
                      type="button"
                      className="text-xs text-sky-300 underline self-start relative z-10"
                      onClick={(e) => {
                        e.stopPropagation()
                        setHintOpen(true)
                      }}
                    >
                      Need a hint?
                    </button>
                  ) : (
                    <p className="text-sm text-sky-100/90 relative z-10">{card.hint || '—'}</p>
                  )}
                  <p className="text-xs text-slate-400">Tap card · swipe right pass · left fail</p>
                </div>
              ) : (
                <div className="relative space-y-4">
                  <p className="text-sm leading-relaxed text-slate-100">{card.definition}</p>
                  <p className="text-xs text-slate-400 italic">{card.example}</p>
                </div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex justify-between w-full max-w-md gap-4">
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            className="flex-1 py-3 rounded-xl bg-rose-500/25 border border-rose-400/40 text-rose-50 text-sm font-semibold"
            onClick={() => void finalize(false)}
          >
            Fail
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            className="flex-1 py-3 rounded-xl bg-emerald-500/25 border border-emerald-400/40 text-emerald-50 text-sm font-semibold"
            onClick={() => void finalize(true)}
          >
            Pass
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}
