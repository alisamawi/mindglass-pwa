/** Browser TTS for study pronunciation (Web Speech API). */

function normLangTag(tag: string): string {
  const t = tag.trim().replace(/_/g, '-')
  return t || 'en-US'
}

/** Prefer an installed voice for this tag so the engine does not keep using the previous (e.g. English) voice. */
function pickVoice(synth: SpeechSynthesis, tag: string): SpeechSynthesisVoice | null {
  const voices = synth.getVoices()
  if (!voices.length) return null
  const primary = normLangTag(tag).toLowerCase()
  const short = primary.split('-')[0] ?? primary

  let best: SpeechSynthesisVoice | null = null
  let bestScore = 0
  for (const v of voices) {
    const l = (v.lang ?? '').replace(/_/g, '-').toLowerCase()
    let s = 0
    if (l === primary) s = 4
    else if (l.startsWith(`${short}-`)) s = 3
    else if (l === short) s = 2
    if (s > bestScore) {
      bestScore = s
      best = v
    }
  }
  return bestScore > 0 ? best : null
}

export function speakTerm(text: string, lang: string): void {
  if (typeof window === 'undefined') return
  const trimmed = text.trim()
  if (!trimmed) return
  const synth = window.speechSynthesis
  if (!synth) return
  synth.cancel()

  const tag = normLangTag(lang)

  const run = () => {
    const u = new SpeechSynthesisUtterance(trimmed)
    u.lang = tag
    u.rate = 0.92
    const voice = pickVoice(synth, tag)
    if (voice) u.voice = voice
    synth.speak(u)
  }

  if (synth.getVoices().length > 0) {
    run()
    return
  }

  let done = false
  const finish = () => {
    if (done) return
    done = true
    synth.removeEventListener('voiceschanged', onVc)
    run()
  }
  const onVc = () => finish()
  synth.addEventListener('voiceschanged', onVc)
  window.setTimeout(finish, 300)
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined') return
  window.speechSynthesis?.cancel()
}
