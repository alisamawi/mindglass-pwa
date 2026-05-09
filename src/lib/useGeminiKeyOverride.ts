import { useCallback, useEffect, useState } from 'react'
import { readStoredGeminiKey, writeStoredGeminiKey } from './geminiKey'

export function useGeminiKeyOverride(): {
  manualKey: string | null
  setManualKey: (key: string | null) => void
} {
  const [manualKey, setKeyState] = useState<string | null>(null)

  useEffect(() => {
    setKeyState(readStoredGeminiKey())
  }, [])

  const setManualKey = useCallback((key: string | null) => {
    writeStoredGeminiKey(key)
    setKeyState(readStoredGeminiKey())
  }, [])

  return { manualKey, setManualKey }
}
