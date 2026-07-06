// DOAR pentru dezvoltare: loghează automat utilizatorul demo din .env.local,
// ca datele să poată fi văzute înainte de ecranul de login (faza 6).
// Ecranul real de login din faza 6 înlocuiește complet acest mecanism.
import { supabase } from './supabase'

export async function ensureDevSession(): Promise<void> {
  const email = import.meta.env.VITE_DEV_LOGIN_EMAIL as string | undefined
  const password = import.meta.env.VITE_DEV_LOGIN_PASSWORD as string | undefined
  if (!email || !password) return

  const { data } = await supabase.auth.getSession()
  if (data.session) return

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.error('Autologin dev eșuat:', error.message)
  }
}
