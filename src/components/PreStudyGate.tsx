export function PreStudyGate({
  open,
  remaining,
  onFinish,
  onStartNext,
}: {
  open: boolean
  remaining: number
  onFinish: () => void
  onStartNext: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/55 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-semibold text-glow">Unfinished set</h2>
        <p className="text-slate-300 text-sm">
          {remaining} card{remaining === 1 ? '' : 's'} left in the current batch.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full py-3 rounded-xl bg-sky-500/90 text-slate-950 font-semibold"
            onClick={onFinish}
          >
            Finish current set
          </button>
          <button
            type="button"
            className="w-full py-3 rounded-xl border border-white/20 text-slate-100"
            onClick={onStartNext}
          >
            Start next batch
          </button>
        </div>
      </div>
    </div>
  )
}
