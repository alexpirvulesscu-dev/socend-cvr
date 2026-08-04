// Registrul de variații (lucrări suplimentare / dispoziții de șantier):
// lucrări în plus propuse clientului, apoi aprobate sau respinse.
// Cele „în așteptare" sunt bani nesiguri — de asta apar pe panou.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type VariationStatus = 'in_asteptare' | 'aprobata' | 'respinsa'

export const VARIATION_STATUS_LABELS: Record<VariationStatus, string> = {
  in_asteptare: 'În așteptare',
  aprobata: 'Aprobată',
  respinsa: 'Respinsă',
}

export interface VariationRow {
  id: string
  project_id: string
  ref: string
  description: string
  amount: number
  status: VariationStatus
  submitted_date: string
  decided_date: string | null
}

export interface NewVariation {
  projectId: string
  description: string
  amount: number
  submittedDate: string
}

const SELECT = 'id, project_id, ref, description, amount, status, submitted_date, decided_date'

export async function fetchVariations(): Promise<VariationRow[]> {
  const { data, error } = await supabase
    .from('cvr_variations')
    .select(SELECT)
    .order('submitted_date', { ascending: false })
  if (error) throw error
  return ((data ?? []) as VariationRow[]).map((v) => ({ ...v, amount: Number(v.amount) }))
}

/** Următorul număr liber pentru un proiect: VO-001, VO-002… */
function nextRef(existing: VariationRow[], projectId: string): string {
  const nums = existing
    .filter((v) => v.project_id === projectId)
    .map((v) => Number(v.ref.replace(/\D/g, '')))
    .filter((n) => Number.isFinite(n))
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1
  return `VO-${String(next).padStart(3, '0')}`
}

export async function addVariation(v: NewVariation, existing: VariationRow[]): Promise<VariationRow> {
  const { data, error } = await supabase
    .from('cvr_variations')
    .insert({
      project_id: v.projectId,
      ref: nextRef(existing, v.projectId),
      description: v.description,
      amount: v.amount,
      submitted_date: v.submittedDate,
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return { ...(data as VariationRow), amount: Number((data as VariationRow).amount) }
}

/** Aprobare/respingere: data deciziei se completează automat, se șterge la revenire. */
export async function setVariationStatus(id: string, status: VariationStatus): Promise<void> {
  const { error } = await supabase
    .from('cvr_variations')
    .update({
      status,
      decided_date: status === 'in_asteptare' ? null : new Date().toISOString().slice(0, 10),
    })
    .eq('id', id)
  if (error) throw error
}

export async function updateVariation(
  id: string,
  patch: Partial<Pick<VariationRow, 'description' | 'amount' | 'submitted_date'>>
): Promise<void> {
  const { error } = await supabase.from('cvr_variations').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteVariation(id: string): Promise<void> {
  const { error } = await supabase.from('cvr_variations').delete().eq('id', id)
  if (error) throw error
}

/** Hook: lista de variații + patch local optimist (același tipar ca arborele). */
export function useVariations() {
  const [variations, setVariations] = useState<VariationRow[]>([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(() => {
    setLoading(true)
    fetchVariations()
      .then(setVariations)
      .catch(() => setVariations([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  /** Înlocuiește un rând în memorie (sau îl șterge cu null) — fără refetch. */
  const patchVariation = useCallback((id: string, next: Partial<VariationRow> | null) => {
    setVariations((old) =>
      next === null ? old.filter((v) => v.id !== id) : old.map((v) => (v.id === id ? { ...v, ...next } : v))
    )
  }, [])

  const addLocal = useCallback((v: VariationRow) => {
    setVariations((old) => [v, ...old])
  }, [])

  return { variations, loading, refetch, patchVariation, addLocal }
}

// ── Agregări folosite de panou și de registru ────────────────────────────

export interface VariationTotals {
  approved: number
  pending: number
  rejected: number
  approvedCount: number
  pendingCount: number
  rejectedCount: number
}

export function variationTotals(variations: VariationRow[]): VariationTotals {
  const t: VariationTotals = {
    approved: 0,
    pending: 0,
    rejected: 0,
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
  }
  for (const v of variations) {
    if (v.status === 'aprobata') {
      t.approved += v.amount
      t.approvedCount++
    } else if (v.status === 'in_asteptare') {
      t.pending += v.amount
      t.pendingCount++
    } else {
      t.rejected += v.amount
      t.rejectedCount++
    }
  }
  return t
}
