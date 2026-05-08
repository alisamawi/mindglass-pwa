import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import { Insights } from './components/Insights'
import { LiquidStudy } from './components/LiquidStudy'
import { PreStudyGate } from './components/PreStudyGate'
import { StudyLab } from './components/StudyLab'
import { TabBar } from './components/TabBar'
import type { FlashCard } from './db'
import { db } from './db'
import { clearSession, loadSession, type PersistedSession } from './lib/sessionStorage'
import { recordBatchCompleted } from './lib/streak'
import { createNewStudySession } from './lib/startStudyBatch'

function Shell() {
  const [tab, setTab] = useState<'study' | 'insights'>('study')
  const [refreshTick, setRefreshTick] = useState(0)
  const bump = () => setRefreshTick((n) => n + 1)

  const [gateOpen, setGateOpen] = useState(false)
  const [gateLeft, setGateLeft] = useState(0)

  const [studyOpen, setStudyOpen] = useState(false)
  const [session, setSession] = useState<PersistedSession | null>(null)
  const [deck, setDeck] = useState<FlashCard[]>([])

  useEffect(() => {
    const s = loadSession()
    if (!s?.cardIds.length) return
    if (s.currentIndex < s.cardIds.length) {
      setGateLeft(s.cardIds.length - s.currentIndex)
      setGateOpen(true)
    }
  }, [])

  const hydrateDeck = useCallback(async (s: PersistedSession) => {
    const loaded = await Promise.all(s.cardIds.map((id) => db.cards.get(id)))
    const ordered = s.cardIds
      .map((id) => loaded.find((c) => c?.id === id))
      .filter(Boolean) as FlashCard[]
    return ordered
  }, [])

  const launchStudy = useCallback(
    async (s: PersistedSession) => {
      const ordered = await hydrateDeck(s)
      if (!ordered.length) return
      setSession(s)
      setDeck(ordered)
      setStudyOpen(true)
    },
    [hydrateDeck],
  )

  return (
    <>
      <div className={`min-h-dvh pb-28 ${studyOpen ? 'blur-none' : ''}`}>
        <header className="pt-[max(0.75rem,env(safe-area-inset-top))] px-4 pb-2 max-w-xl mx-auto">
          <h1 className="text-xl font-semibold tracking-tight text-glow">MindGlass</h1>
          <p className="text-[11px] text-slate-500">FIFO intro · Liteck · local-first</p>
        </header>
        <div className="flex flex-col items-center">
          {!studyOpen && <TabBar active={tab} onChange={setTab} />}
          <main className="w-full">
            {!studyOpen && tab === 'study' && (
              <StudyLab
                onDeckReady={(s) => void launchStudy(s)}
                refreshTick={refreshTick}
                onCardsChanged={bump}
              />
            )}
            {!studyOpen && tab === 'insights' && <Insights refreshKey={refreshTick} />}
          </main>
        </div>
      </div>

      <AnimatePresence>
        {studyOpen && session && deck.length > 0 && (
          <LiquidStudy
            key={session.batchKey}
            deck={deck}
            session={session}
            onPersistSession={setSession}
            onClose={() => setStudyOpen(false)}
            onBatchComplete={() => {
              clearSession()
              recordBatchCompleted()
              bump()
              setStudyOpen(false)
              setSession(null)
              setDeck([])
            }}
          />
        )}
      </AnimatePresence>

      <PreStudyGate
        open={gateOpen}
        remaining={gateLeft}
        onFinish={() => {
          const s = loadSession()
          setGateOpen(false)
          if (s) void launchStudy(s)
        }}
        onStartNext={() =>
          void (async () => {
            const s = await createNewStudySession()
            setGateOpen(false)
            if (s) void launchStudy(s)
            else {
              bump()
              alert('Nothing to study yet — add or import cards on Study Lab.')
            }
          })()
        }
      />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
