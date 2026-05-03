import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)   // raw Supabase user
  const [profile, setProfile] = useState(null)   // row from public.profiles
  const [loading, setLoading] = useState(true)

  /** Pull the authoritative profile row (role / name / department). */
  const refreshProfile = useCallback(async (uid) => {
    if (!uid) { setProfile(null); return null }
    try {
      const { data, error } = await supabase
        .from('profiles').select('*').eq('id', uid).single()
      if (error) throw error
      setProfile(data)
      return data
    } catch {
      // If profile fetch fails (e.g. token expired), don't blow up the app —
      // just clear and let the auth listener handle re-login.
      setProfile(null)
      return null
    }
  }, [])

  // Initial mount: read session + profile, subscribe to auth changes.
  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (cancelled) return
      const u = session?.user ?? null
      setUser(u)
      await refreshProfile(u?.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      await refreshProfile(u?.id)
    })

    return () => { cancelled = true; subscription.unsubscribe() }
  }, [refreshProfile])

  // When the tab regains focus after a long idle, ask Supabase to refresh
  // the session and re-pull the profile. This avoids hard 404s caused by
  // stale tokens silently expiring while the tab was inactive.
  useEffect(() => {
    const onFocus = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const u = session?.user ?? null
      setUser(u)
      if (u) await refreshProfile(u.id)
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshProfile])

  /** Sign in with email + password */
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw { response: { data: { detail: error.message } } }
    setUser(data.user)
    await refreshProfile(data.user.id)
    return data.user
  }

  /** Register a new user — metadata is picked up by the DB trigger to populate profiles */
  const signUp = async ({ name, email, password, role, department }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, role, department } },
    })
    if (error) throw { response: { data: { detail: error.message } } }
    setUser(data.user)
    await refreshProfile(data.user?.id)
    return data.user
  }

  /** Sign out */
  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setProfile(null)
  }

  // Compose a stable user object. Role/department come from the DB profile
  // (authoritative) and fall back to user_metadata only on first signup
  // before the profile trigger has finished.
  const currentUser = user
    ? {
        id:         user.id,
        email:      user.email,
        name:       profile?.name       || user.user_metadata?.name       || user.email,
        role:       profile?.role       || user.user_metadata?.role       || 'faculty',
        department: profile?.department || user.user_metadata?.department || '',
      }
    : null

  const isAdmin = currentUser?.role === 'admin'

  return (
    <AuthContext.Provider value={{ user: currentUser, isAdmin, loading, signIn, signUp, signOut, refreshProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
