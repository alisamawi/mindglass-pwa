import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

const Ctx = createContext<(msg: string) => void>(() => {})

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null)
  const tref = useRef<number>(0)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(tref.current)
    tref.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  useEffect(() => () => window.clearTimeout(tref.current), [])

  return (
    <Ctx.Provider value={notify}>
      {children}
      {toast && (
        <output
          aria-live="polite"
          className="fixed z-[120] bottom-[max(5.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 max-w-sm w-[calc(100%-2rem)] px-4 py-3 rounded-2xl bg-slate-900/95 border border-emerald-400/25 text-sm text-emerald-100/95 shadow-xl text-center pointer-events-none"
        >
          {toast}
        </output>
      )}
    </Ctx.Provider>
  )
}

export function useNotify(): (msg: string) => void {
  return useContext(Ctx)
}
