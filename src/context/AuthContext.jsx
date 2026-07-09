import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // El perfil lo crea un trigger en el signup; se reintenta por si tarda un instante.
  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    for (let intento = 0; intento < 3; intento++) {
      const { data } = await supabase
        .from('profiles')
        .select('*, organizations(*)')
        .eq('id', userId)
        .maybeSingle()
      if (data) {
        setProfile(data)
        return
      }
      await sleep(600)
    }
  }, [])

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      loadProfile(data.session?.user?.id).finally(() => {
        if (alive) setLoading(false)
      })
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      loadProfile(s?.user?.id)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const value = {
    session,
    profile,
    org: profile?.organizations ?? null,
    loading,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
