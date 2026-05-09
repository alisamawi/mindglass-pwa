import { AnimatePresence } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { CourseHome } from './components/CourseHome'
import { Insights } from './components/Insights'
import { LiquidStudy } from './components/LiquidStudy'
import { OnboardingModal } from './components/OnboardingModal'
import { Settings } from './components/Settings'
import { StudyLab } from './components/StudyLab'
import { TabBar } from './components/TabBar'
import type { Course, FlashCard } from './db'
import { db } from './db'
import { NotifyProvider, useNotify } from './context/NotifyContext'
import {
  MG_HOME,
  pushMindglassState,
  readMindglassState,
  replaceMindglassState,
} from './lib/appHistory'
import { useGeminiKeyOverride } from './lib/useGeminiKeyOverride'
import {
  clearSession,
  getPendingSession,
  loadSession,
  type PersistedSession,
} from './lib/sessionStorage'
import { recordBatchCompleted } from './lib/streak'

function Shell() {
  const notify = useNotify()
  const { manualKey, setManualKey } = useGeminiKeyOverride()
  const envKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() || null
  const effectiveApiKey = manualKey ?? envKey
  const geminiAuth = useMemo(() => ({ apiKey: effectiveApiKey }), [effectiveApiKey])

  const [tab, setTab] = useState<'study' | 'insights' | 'settings'>('study')
  const [refreshTick, setRefreshTick] = useState(0)
  const bump = useCallback(() => setRefreshTick((n) => n + 1), [])

  const [activeCourse, setActiveCourse] = useState<Course | null>(null)
  const [onboardingOpen, setOnboardingOpen] = useState(false)

  const [studyOpen, setStudyOpen] = useState(false)
  const [session, setSession] = useState<PersistedSession | null>(null)
  const [deck, setDeck] = useState<FlashCard[]>([])

  const [pendingList, setPendingList] = useState<{
    courseId: string
    courseName: string
    remaining: number
  } | null>(null)

  useEffect(() => {
    replaceMindglassState(MG_HOME)
  }, [])

  useEffect(() => {
    const s = getPendingSession()
    if (!s) {
      setPendingList(null)
      return
    }
    void db.courses.get(s.courseId).then((c) => {
      if (!c) {
        clearSession()
        setPendingList(null)
        return
      }
      setPendingList({
        courseId: s.courseId,
        courseName: c.name,
        remaining: s.cardIds.length - s.currentIndex,
      })
    })
  }, [refreshTick, studyOpen, activeCourse?.id])

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const mg = readMindglassState(e)
      if (!mg) return
      setTab(mg.tab)
      setStudyOpen(mg.study)
      if (mg.courseId) {
        void db.courses.get(mg.courseId).then((c) => setActiveCourse(c ?? null))
      } else {
        setActiveCourse(null)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
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
      pushMindglassState({
        v: 1,
        tab: 'study',
        courseId: s.courseId,
        study: true,
      })
      setSession(s)
      setDeck(ordered)
      setStudyOpen(true)
      notify('Study round opened.')
    },
    [hydrateDeck, notify],
  )

  const closeStudyNav = useCallback(() => {
    if (readMindglassState()?.study) {
      window.history.back()
    } else {
      setStudyOpen(false)
    }
  }, [])

  const goToPendingCourse = useCallback(() => {
    const s = getPendingSession()
    if (!s) return
    void db.courses.get(s.courseId).then((c) => {
      if (!c) {
        clearSession()
        bump()
        notify('That course no longer exists — unfinished round cleared.')
        return
      }
      pushMindglassState({ v: 1, tab: 'study', courseId: c.id, study: false })
      setActiveCourse(c)
      setTab('study')
      notify(`Opened “${c.name}” — continue your round below.`)
    })
  }, [bump, notify])

  const discardPendingRound = useCallback(() => {
    clearSession()
    bump()
    notify('Unfinished round discarded.')
  }, [bump, notify])

  return (
    <>
      <div className={`min-h-dvh pb-28 ${studyOpen ? 'blur-none' : ''}`}>
        <header className="pt-[max(0.75rem,env(safe-area-inset-top))] px-4 pb-2 max-w-xl mx-auto w-full">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
                width={40}
                height={40}
                alt=""
                className="w-10 h-10 shrink-0 rounded-2xl shadow-lg shadow-sky-500/20 ring-1 ring-white/10 object-cover"
              />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-glow">MindGlass</h1>
                <p className="text-[11px] text-slate-500">
                  {activeCourse ? (
                    <>
                      Course: <span className="text-slate-400">{activeCourse.name}</span>
                    </>
                  ) : (
                    <>Pick a course · Liteck · local-first</>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 mt-0.5 px-3 py-1.5 rounded-lg border border-white/15 text-[11px] font-medium text-sky-300/95 hover:bg-white/[0.06] transition"
              onClick={() => setOnboardingOpen(true)}
            >
              About
            </button>
          </div>
        </header>
        <div className="flex flex-col items-center">
          {!studyOpen && (
            <TabBar
              active={tab}
              onChange={(t) => {
                /* Replace current history entry so Back drills down (e.g. course → home), not tab-to-tab. */
                replaceMindglassState({
                  v: 1,
                  tab: t,
                  courseId: activeCourse?.id ?? null,
                  study: false,
                })
                setTab(t)
              }}
            />
          )}
          <main className="w-full">
            {!studyOpen && tab === 'study' && (
              <>
                {!activeCourse && (
                  <CourseHome
                    refreshKey={refreshTick}
                    onOpenCourse={(c) => {
                      pushMindglassState({ v: 1, tab: 'study', courseId: c.id, study: false })
                      setActiveCourse(c)
                      setTab('study')
                    }}
                    pendingRound={pendingList}
                    onGoToPendingCourse={goToPendingCourse}
                    onDiscardPendingRound={discardPendingRound}
                  />
                )}
                {activeCourse && (
                  <StudyLab
                    course={activeCourse}
                    geminiAuth={geminiAuth}
                    onBack={() => window.history.back()}
                    onDeckReady={(s) => void launchStudy(s)}
                    refreshTick={refreshTick}
                    onCardsChanged={bump}
                    onOpenSettings={() => {
                      pushMindglassState({
                        v: 1,
                        tab: 'settings',
                        courseId: activeCourse?.id ?? null,
                        study: false,
                      })
                      setTab('settings')
                    }}
                    onCourseDeleted={(courseId) => {
                      const s = loadSession()
                      if (s?.courseId === courseId) {
                        clearSession()
                      }
                      replaceMindglassState(MG_HOME)
                      setActiveCourse(null)
                      setStudyOpen(false)
                      setSession(null)
                      setDeck([])
                      bump()
                      notify('Course deleted.')
                    }}
                  />
                )}
              </>
            )}
            {!studyOpen && tab === 'insights' && <Insights refreshKey={refreshTick} />}
            {!studyOpen && tab === 'settings' && (
              <Settings
                manualKey={manualKey}
                setManualKey={setManualKey}
                onSettingsChanged={bump}
              />
            )}
          </main>
        </div>
      </div>

      <OnboardingModal open={onboardingOpen} onClose={() => setOnboardingOpen(false)} />

      <AnimatePresence>
        {studyOpen && session && deck.length > 0 && (
          <LiquidStudy
            key={session.batchKey}
            deck={deck}
            session={session}
            onPersistSession={setSession}
            onClose={closeStudyNav}
            onBatchComplete={() => {
              clearSession()
              recordBatchCompleted()
              bump()
              setSession(null)
              setDeck([])
              notify('Round finished — streak updated.')
              if (readMindglassState()?.study) {
                window.history.back()
              } else {
                setStudyOpen(false)
              }
            }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

export default function App() {
  return (
    <NotifyProvider>
      <Shell />
    </NotifyProvider>
  )
}
