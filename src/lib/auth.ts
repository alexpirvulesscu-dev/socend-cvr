// Autentificare: sesiunea Supabase + rolul CVR al utilizatorului logat.
// Rolul vine din metadata utilizatorului (app_metadata întâi — doar adminul
// o poate seta — apoi user_metadata), exact ca funcția cvr_role() din RLS.
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type Role = 'admin' | 'finance' | 'site' | null

export function roleFromSession(session: Session | null): Role {
  if (!session) return null
  const meta = session.user
  const raw =
    (meta.app_metadata?.role as string | undefined) ??
    (meta.user_metadata?.role as string | undefined)
  return raw === 'admin' || raw === 'finance' || raw === 'site' ? raw : null
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, role: roleFromSession(session), loading }
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
