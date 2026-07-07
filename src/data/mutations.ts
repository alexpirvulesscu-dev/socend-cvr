// Scrieri în Supabase folosite de ecranele de birou.
// Ștergerile de aici sunt permise: ating DOAR rânduri create de acest proiect
// (curățenia unui proiect abia creat, la eșec de salvare).
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

// ── Crearea unui proiect nou (wizard-ul Configurare) ─────────────────────
export interface NewDeliverable {
  name: string
  um: string
  qtyTotal: number
  weight: number
}

export interface NewTask {
  name: string
  value: number
  deliverables: NewDeliverable[]
}

export interface NewJob {
  name: string
  startDate: string
  endDate: string
  budgets: Record<CostCategory, number>
  tasks: NewTask[]
}

export interface NewProject {
  name: string
  client: string
  billingMode: 'stadii_fizice' | 'lunara'
  startDate: string
  endDate: string
  jobs: NewJob[]
}

/**
 * Salvează întregul arbore al proiectului nou.
 * Inserările sunt secvențiale (proiect → joburi → bugete → taskuri → livrabile);
 * dacă un pas eșuează, proiectul deja creat se șterge (cascade), ca să nu
 * rămână un proiect pe jumătate configurat.
 */
export async function createProject(p: NewProject): Promise<string> {
  const contractValue = p.jobs.reduce(
    (s, j) => s + j.tasks.reduce((ts, t) => ts + t.value, 0),
    0
  )

  const { data: proj, error: projErr } = await supabase
    .from('projects')
    .insert({
      name: p.name,
      client: p.client || null,
      billing_mode: p.billingMode,
      contract_value: contractValue,
      start_date: p.startDate || null,
      end_date: p.endDate || null,
    })
    .select('id')
    .single()
  if (projErr) throw projErr
  const projectId = proj.id as string

  try {
    for (const [ji, job] of p.jobs.entries()) {
      const { data: jobRow, error: jobErr } = await supabase
        .from('jobs')
        .insert({
          project_id: projectId,
          name: job.name,
          start_date: job.startDate,
          end_date: job.endDate,
          sort_order: ji + 1,
        })
        .select('id')
        .single()
      if (jobErr) throw jobErr
      const jobId = jobRow.id as string

      const budgetRows = Object.entries(job.budgets)
        .filter(([, amount]) => amount > 0)
        .map(([category, amount]) => ({ job_id: jobId, category, amount }))
      if (budgetRows.length > 0) {
        const { error: budErr } = await supabase.from('cvr_job_budgets').insert(budgetRows)
        if (budErr) throw budErr
      }

      for (const [ti, task] of job.tasks.entries()) {
        const { data: taskRow, error: taskErr } = await supabase
          .from('tasks')
          .insert({ job_id: jobId, name: task.name, value: task.value, sort_order: ti + 1 })
          .select('id')
          .single()
        if (taskErr) throw taskErr

        const delivRows = task.deliverables.map((d, di) => ({
          task_id: taskRow.id as string,
          name: d.name,
          um: d.um,
          qty_total: d.qtyTotal,
          weight: d.weight,
          sort_order: di + 1,
        }))
        if (delivRows.length > 0) {
          const { error: delErr } = await supabase.from('deliverables').insert(delivRows)
          if (delErr) throw delErr
        }
      }
    }

    // facturarea pornește de la zero
    const { error: billErr } = await supabase.from('cvr_billing').insert({ project_id: projectId })
    if (billErr) throw billErr
  } catch (err) {
    // curățenie: cascade șterge tot ce s-a apucat să creeze
    const { error: cleanupErr } = await supabase.from('projects').delete().eq('id', projectId)
    if (cleanupErr) {
      // dacă nici curățenia nu merge, spunem explicit că a rămas un proiect pe jumătate
      throw new Error(
        `${(err as Error).message} — în plus, curățenia a eșuat (${cleanupErr.message}); ` +
          `proiectul "${p.name}" poate exista incomplet și trebuie șters manual`
      )
    }
    throw err
  }

  return projectId
}
