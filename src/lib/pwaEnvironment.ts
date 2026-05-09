/** True when launched from home screen / installed PWA. */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

/** iPhone / iPod touch / iPad — including iPadOS Safari pretending to be Mac (desktop mode). */
export function isIosOrIpados(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Used for optional install prompts. Includes phones with “Request Desktop Website”
 * (Mac-like UA + touch + narrow viewport).
 */
export function isLikelyMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  if (isStandalonePwa()) return false

  const ua = navigator.userAgent || ''
  const ud = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData
  if (ud?.mobile === true) return true
  if (/iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true
  if (isIosOrIpados()) return true

  const touchCapable = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  if (touchCapable && window.matchMedia('(max-width: 915px)').matches) return true

  return false
}
