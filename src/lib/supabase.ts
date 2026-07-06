import { createClient } from '@supabase/supabase-js'

// Clientul Supabase partajat de întreaga aplicație.
// URL-ul și cheia publică vin din .env.local (nu se comit în git).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Lipsesc variabilele VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY din .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
