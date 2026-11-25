// Sugestiile (0034): probleme și idei pentru o aplicație mai bună.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const TITLE_MAX = 80

export interface Suggestion {
  id: string
  author_name: string
  title: string
  details: string | null
  created_at: string
}

const COLS = 'id, author_name, title, details, created_at'

const msg = (e: unknown) => (e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e)))

export function useSuggestions() {
  const [list, setList] = useState<Suggestion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('cvr_suggestions').select(COLS).order('created_at', { ascending: false })
    if (error) return setError(msg(error))
    setList((data ?? []) as Suggestion[])
    setError(null)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { list, error, reload, setList }
}

export async function addSuggestion(s: { author_name: string; title: string; details: string | null }): Promise<Suggestion> {
  const { data, error } = await supabase.from('cvr_suggestions').insert(s).select(COLS).single()
  if (error) throw new Error(msg(error))
  return data as Suggestion
}
