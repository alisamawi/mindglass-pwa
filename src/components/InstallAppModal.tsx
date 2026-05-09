import { useCallback, useEffect, useRef, useState } from 'react'
import { isIosOrIpados, isLikelyMobileDevice, isStandalonePwa } from '../lib/pwaEnvironment'

const SNOOZE_KEY = 'mindglass-install-snooze-until'
const NEVER_KEY = 'mindglass-install-never'

function isDismissed(): boolean {
  try {
    if (localStorage.getItem(NEVER_KEY) === '1') return true
    const until = Number(localStorage.getItem(SNOOZE_KEY) || '0')
    return until > Date.now()
  } catch {
    return false
  }
}

export function InstallAppModal({
  blocked,
  manualOpenNonce = 0,
}: {
  blocked: boolean
  manualOpenNonce?: number
}) {
  const [open, setOpen] = useState(false)
  const [enter, setEnter] = useState(false)
  const [openedViaManual, setOpenedViaManual] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)

  const armedRef = useRef(false)
  const blockedRef = useRef(blocked)
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null)
  const lastManualNonceRef = useRef(0)

  useEffect(() => {
    blockedRef.current = blocked
  }, [blocked])

  useEffect(() => {
    deferredRef.current = deferred
  }, [deferred])

  const attemptShow = useCallback(() => {
    if (!armedRef.current || blockedRef.current || isDismissed()) return
    if (isIosOrIpados()) {
      setOpen(true)
      return
    }
    if (deferredRef.current) setOpen(true)
  }, [])

  useEffect(() => {
    if (manualOpenNonce <= 0 || manualOpenNonce === lastManualNonceRef.current) return
    if (isStandalonePwa()) return
    lastManualNonceRef.current = manualOpenNonce
    const id = requestAnimationFrame(() => {
      setOpenedViaManual(true)
      setOpen(true)
    })
    return () => cancelAnimationFrame(id)
  }, [manualOpenNonce])

  useEffect(() => {
    if (isStandalonePwa() || !isLikelyMobileDevice() || isDismissed()) return

    const onBip = (e: BeforeInstallPromptEvent) => {
      e.preventDefault()
      setDeferred(e)
      deferredRef.current = e
    }
    window.addEventListener('beforeinstallprompt', onBip)

    const timer = window.setTimeout(() => {
      armedRef.current = true
      requestAnimationFrame(() => attemptShow())
    }, 4000)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.clearTimeout(timer)
    }
  }, [attemptShow])

  useEffect(() => {
    if (blocked) return
    const id = requestAnimationFrame(() => attemptShow())
    return () => cancelAnimationFrame(id)
  }, [blocked, attemptShow])

  useEffect(() => {
    if (!deferred) return
    const id = requestAnimationFrame(() => attemptShow())
    return () => cancelAnimationFrame(id)
  }, [deferred, attemptShow])

  useEffect(() => {
    if (!open) {
      const id = requestAnimationFrame(() => setEnter(false))
      return () => cancelAnimationFrame(id)
    }
    const id = requestAnimationFrame(() => setEnter(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  const close = () => {
    setOpenedViaManual(false)
    setOpen(false)
  }

  const snooze = () => {
    if (!openedViaManual) {
      try {
        localStorage.setItem(SNOOZE_KEY, String(Date.now() + 10 * 24 * 60 * 60 * 1000))
      } catch {
        /* ignore */
      }
    }
    close()
  }

  const neverAgain = () => {
    try {
      localStorage.setItem(NEVER_KEY, '1')
    } catch {
      /* ignore */
    }
    close()
  }

  const runAndroidInstall = async () => {
    const ev = deferredRef.current
    if (!ev) return
    try {
      await ev.prompt()
      await ev.userChoice
    } catch {
      /* ignore */
    }
    setDeferred(null)
    deferredRef.current = null
    close()
  }

  if (!open) return null

  const showAndroidInstall = !isIosOrIpados() && deferred != null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="install-app-title"
      onClick={snooze}
    >
      <div
        className={`glass-card w-full max-w-md max-h-[85dvh] overflow-y-auto p-5 space-y-4 transition transform ${
          enter ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 sm:translate-y-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="install-app-title" className="text-lg font-semibold text-glow">
          Install MindGlass
        </h2>
        {showAndroidInstall ? (
          <p className="text-sm text-slate-400">
            Install this app for quick access from your home screen and a fuller-screen experience.
          </p>
        ) : (
          <div className="text-sm text-slate-400 space-y-3">
            <p>
              On <span className="text-slate-200 font-medium">iPhone and iPad</span>, use{' '}
              <span className="text-slate-200 font-medium">Safari</span> for the best result (Chrome on iOS uses the same engine but the
              menus differ).
            </p>
            <ol className="list-decimal pl-4 space-y-2 text-slate-300">
              <li>
                Tap <span className="text-slate-200 font-medium">Share</span> <span className="whitespace-nowrap">(□↑)</span> in the toolbar.
              </li>
              <li>
                Scroll down in the sheet — <span className="text-slate-200 font-medium">Add to Home Screen</span> is often below the fold.
                If it’s missing: tap <span className="text-slate-200 font-medium">Edit Actions</span> and enable it.
              </li>
              <li>
                Tap <span className="text-slate-200 font-medium">Add</span>.
              </li>
            </ol>
            <p className="text-xs text-slate-500">
              If you don’t see Share as <span className="whitespace-nowrap">□↑</span>, tap <span className="text-slate-300">⋯</span> or{' '}
              <span className="text-slate-300">aA</span> in the address bar area — options vary by iOS version.
            </p>
            <p className="text-xs text-slate-500">
              Using <span className="text-slate-300">Request Desktop Website</span>? Turn it off for this site (Safari{' '}
              <span className="text-slate-300">aA</span> menu) so iOS treats it like a normal mobile page.
            </p>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {showAndroidInstall && (
            <button
              type="button"
              className="w-full py-3 rounded-xl bg-sky-500/90 text-slate-950 font-semibold text-sm"
              onClick={() => void runAndroidInstall()}
            >
              Install app
            </button>
          )}
          <button
            type="button"
            className="w-full py-3 rounded-xl border border-white/15 text-slate-200 font-medium text-sm hover:bg-white/[0.06] transition"
            onClick={snooze}
          >
            {openedViaManual ? 'Done' : 'Maybe later'}
          </button>
          {!openedViaManual && (
            <button
              type="button"
              className="w-full py-2 text-xs text-slate-500 hover:text-slate-400 transition"
              onClick={neverAgain}
            >
              Don’t ask again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
