import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)   // true while Supabase checks session

  // On mount: restore session from Supabase (persisted in localStorage automatically)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Keep user state in sync with Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  /** Sign in with email + password */
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw { response: { data: { detail: error.message } } }
    setUser(data.user)
    return data.user
  }

  /** Register a new user — metadata is picked up by the DB trigger to populate profiles */
  const signUp = async ({ name, email, password, role, department }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role, department },    // stored in auth.users.raw_user_meta_data
      },
    })
    if (error) throw { response: { data: { detail: error.message } } }
    setUser(data.user)
    return data.user
  }

  /** Sign out */
  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  // Expose a plain user object that existing components can read (user.name etc.)
  // Supabase stores the display name in user.user_metadata
  const currentUser = user
    ? {
        id:         user.id,
        email:      user.email,
        name:       user.user_metadata?.name       || user.email,
        role:       user.user_metadata?.role       || 'faculty',
        department: user.user_metadata?.department || '',
      }
    : null

  return (
    <AuthContext.Provider value={{ user: currentUser, loading, signIn, signUp, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
