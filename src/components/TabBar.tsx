type Tab = 'study' | 'insights' | 'settings'

export function TabBar({
  active,
  onChange,
}: {
  active: Tab
  onChange: (t: Tab) => void
}) {
  const btn = (id: Tab, label: string) => (
    <button
      type="button"
      onClick={() => onChange(id)}
      className={`flex-1 py-3 text-[13px] sm:text-sm font-medium rounded-xl transition ${
        active === id
          ? 'glass-card text-sky-100'
          : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {label}
    </button>
  )
  return (
    <nav className="glass-panel p-1.5 flex gap-1 mx-4 mb-4 max-w-lg w-full">
      {btn('study', 'Study')}
      {btn('insights', 'Insights')}
      {btn('settings', 'Settings')}
    </nav>
  )
}
