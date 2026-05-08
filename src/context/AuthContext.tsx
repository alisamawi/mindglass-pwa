import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type OAuthCredential,
  type User,
} from 'firebase/auth'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { firebaseConfigured, firebaseOptions } from '../firebase'

type AuthCtx = {
  firebaseOk: boolean
  user: User | null
  googleAccessToken: string | null
  signInGoogle: () => Promise<void>
  signOutApp: () => Promise<void>
  busy: boolean
  error: string | null
}

const Ctx = createContext<AuthCtx | null>(null)

let appSingleton: FirebaseApp | null = null

function getFirebaseApp(): FirebaseApp {
  if (!firebaseOptions) throw new Error('Firebase env missing')
  if (!appSingleton) appSingleton = getApps()[0] ?? initializeApp(firebaseOptions)
  return appSingleton
}

function googleProvider(): GoogleAuthProvider {
  const p = new GoogleAuthProvider()
  p.setCustomParameters({ prompt: 'select_account' })
  p.addScope('https://www.googleapis.com/auth/cloud-platform')
  return p
}

function accessFromCredential(cr: OAuthCredential | null): string | null {
  return cr?.accessToken ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [googleAccessToken, setTok] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!firebaseConfigured || !firebaseOptions) return
    const app = getFirebaseApp()
    const auth = getAuth(app)
    return onAuthStateChanged(auth, (u) => setUser(u))
  }, [])

  const signInGoogle = useCallback(async () => {
    setErr(null)
    if (!firebaseConfigured || !firebaseOptions) {
      setErr('Add Firebase web config to `.env`.')
      return
    }
    setBusy(true)
    try {
      const auth = getAuth(getFirebaseApp())
      const res = await signInWithPopup(auth, googleProvider())
      const cred = GoogleAuthProvider.credentialFromResult(res)
      setTok(accessFromCredential(cred))
    } catch {
      setTok(null)
      setErr('Google sign-in failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const signOutApp = useCallback(async () => {
    setErr(null)
    if (!firebaseConfigured || !firebaseOptions) return
    setBusy(true)
    try {
      await fbSignOut(getAuth(getFirebaseApp()))
      setTok(null)
    } catch {
      setErr('Sign-out failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const value = useMemo<AuthCtx>(
    () => ({
      firebaseOk: firebaseConfigured,
      user,
      googleAccessToken,
      signInGoogle,
      signOutApp,
      busy,
      error,
    }),
    [user, googleAccessToken, signInGoogle, signOutApp, busy, error],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth missing provider')
  return ctx
}
