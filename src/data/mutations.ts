// Scrieri în Supabase folosite de ecranele de birou.
import { supabase } from '../lib/supabase'
import type { TaskStatus } from '../domain/kpi'
import type { CostCategory } from './projects'

/** Adaugă un cost real pe un job (formularul „Adaugă cost"). */
export async function addCostEntry(
  jobId: string,
  entry: { category: CostCategory; amount: number; description: string; entryDate: string }
): Promise<void> {
  const { error } = await supabase.from('cvr_cost_entries').insert({
    job_id: jobId,
    category: entry.category,
    amount: entry.amount,
    description: entry.description || null,
    entry_date: entry.entryDate,
  })
  if (error) throw error
}

/** Schimbă statusul unui task (Pornește taskul / Marchează finalizat). */
export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId)
  if (error) throw error
}
