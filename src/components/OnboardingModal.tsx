import { useEffect, useState } from 'react'

export function OnboardingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [enter, setEnter] = useState(false)

  useEffect(() => {
    if (open) {
      const t = window.requestAnimationFrame(() => setEnter(true))
      return () => cancelAnimationFrame(t)
    }
    setEnter(false)
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="onboard-title"
      onClick={onClose}
    >
      <div
        className={`glass-card w-full max-w-md max-h-[85dvh] overflow-y-auto p-5 space-y-4 transition transform ${
          enter ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 sm:translate-y-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="onboard-title" className="text-lg font-semibold text-glow">
          Welcome to MindGlass
        </h2>
        <p className="text-sm text-slate-400">
          A local-first flashcard app with Liteck scheduling. Your decks and progress stay in this browser unless you
          clear site data.
        </p>
        <ul className="text-sm text-slate-300 space-y-3 list-disc pl-4">
          <li>
            <span className="font-medium text-slate-200">Courses</span> — organize cards by subject. Open a course to add
            cards, run AI import, or start a study round.
          </li>
          <li>
            <span className="font-medium text-slate-200">Study rounds</span> — each round mixes due reviews and new
            cards. Swipe to grade; tap the card to flip. Configure round size under Settings.
          </li>
          <li>
            <span className="font-medium text-slate-200">Resume</span> — if you leave mid-round, open that course again
            (or use the banner on the course list) to continue or start over.
          </li>
          <li>
            <span className="font-medium text-slate-200">AI import</span> — needs a Gemini API key from Google AI
            Studio (Settings).
          </li>
          <li>
            <span className="font-medium text-slate-200">Insights</span> — streak and per-course stats on the Insights
            tab.
          </li>
        </ul>
        <button
          type="button"
          className="w-full py-3 rounded-xl bg-sky-500/90 text-slate-950 font-semibold text-sm"
          onClick={onClose}
        >
          Got it
        </button>
      </div>
    </div>
  )
}
