// Clienții: o grupare doar pe ecran peste proiectele și joburile existente (0027).
// Un rând arată fie un proiect întreg, fie un job dintr-un proiect.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ClientItem {
  id: string
  project_id: string
  job_id: string | null
  label: string | null
  sort_order: number
}

export interface ClientRow {
  id: string
  name: string
  sort_order: number
  cvr_client_items: ClientItem[]
}

export function useClients() {
  const [clients, setClients] = useState<ClientRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void supabase
      .from('cvr_clients')
      .select('id, name, sort_order, cvr_client_items ( id, project_id, job_id, label, sort_order )')
      .order('sort_order')
      .then(({ data, error: err }) => {
        if (!live) return
        if (err) setError(err.message)
        else
          setClients(
            ((data ?? []) as ClientRow[]).map((c) => ({
              ...c,
              cvr_client_items: [...c.cvr_client_items].sort((a, b) => a.sort_order - b.sort_order),
            }))
          )
      })
    return () => {
      live = false
    }
  }, [])
  return { clients, error }
}
