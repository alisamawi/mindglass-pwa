export type MindglassHistoryState = {
  v: 1
  tab: 'study' | 'insights' | 'settings'
  courseId: string | null
  study: boolean
}

export function readMindglassState(from?: PopStateEvent | null): MindglassHistoryState | null {
  const raw = from?.state ?? window.history.state
  const mg = raw as { mg?: MindglassHistoryState } | null
  return mg?.mg?.v === 1 ? mg.mg : null
}

export function replaceMindglassState(s: MindglassHistoryState): void {
  window.history.replaceState({ mg: s }, '')
}

export function pushMindglassState(s: MindglassHistoryState): void {
  window.history.pushState({ mg: s }, '')
}

export const MG_HOME: MindglassHistoryState = {
  v: 1,
  tab: 'study',
  courseId: null,
  study: false,
}
