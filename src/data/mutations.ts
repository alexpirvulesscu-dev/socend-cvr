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

/** Schimbă statusul unui task (Pornește / Marchează finalizat / Redeschide). */
export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase.from('tasks').update({ status }).eq('id', taskId)
  if (error) throw error
}

/** Șterge un cost înregistrat greșit. */
export async function deleteCostEntry(id: string): Promise<void> {
  const { error } = await supabase.from('cvr_cost_entries').delete().eq('id', id)
  if (error) throw error
}

// ── Editarea proiectului + sincronizarea cu P&L (tabelul `proiecte`) ─────
// Regula: numele și flag-ul activ se oglindesc pe rândul P&L legat prin
// pnl_proiect_id. Proiectele fără legătură (ex. cele demo) nu ating P&L-ul.

export interface ProjectPatch {
  name: string
  client: string
  billingMode: 'stadii_fizice' | 'lunara'
  startDate: string
  endDate: string
}

async function syncPnl(pnlId: string | null, patch: { nume?: string; activ?: boolean }) {
  if (!pnlId) return
  // La redenumire, aplicația P&L cascadează numele și în plati/incasari
  // (referință prin TEXT, nu prin id) — replicăm exact același comportament.
  if (patch.nume !== undefined) {
    const { data: old, error: readErr } = await supabase
      .from('proiecte')
      .select('nume')
      .eq('id', pnlId)
      .single()
    if (readErr) throw readErr
    const oldName = old.nume as string
    if (oldName !== patch.nume) {
      const { error: e1 } = await supabase
        .from('incasari')
        .update({ proiect: patch.nume })
        .eq('proiect', oldName)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('plati')
        .update({ proiect: patch.nume })
        .eq('proiect', oldName)
      if (e2) throw e2
    }
  }
  const { error } = await supabase.from('proiecte').update(patch).eq('id', pnlId)
  if (error) throw error
}

export async function updateProject(
  id: string,
  pnlId: string | null,
  p: ProjectPatch
): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({
      name: p.name,
      client: p.client || null,
      billing_mode: p.billingMode,
      start_date: p.startDate || null,
      end_date: p.endDate || null,
    })
    .eq('id', id)
  if (error) throw error
  await syncPnl(pnlId, { nume: p.name })
}

/** Finalizează / reactivează proiectul (bucket-ul „Finalizate") + sincron P&L. */
export async function setProjectActive(
  id: string,
  pnlId: string | null,
  active: boolean
): Promise<void> {
  const { error } = await supabase.from('projects').update({ active }).eq('id', id)
  if (error) throw error
  await syncPnl(pnlId, { activ: active })
}

/**
 * Șterge complet proiectul din CVR (cascade: joburi, taskuri, livrabile,
 * costuri, facturare, raportări). Rândul P&L legat NU se șterge — doar se
 * dezactivează, ca istoricul de plăți/încasări din P&L să rămână valid.
 */
export async function deleteProject(id: string, pnlId: string | null): Promise<void> {
  await syncPnl(pnlId, { activ: false })
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw error
}

/** Fluxul de facturare (Executat/Aprobat/Facturat/Încasat) — corectabil din birou. */
export async function updateBilling(
  projectId: string,
  b: { depus: number; certificat: number; facturat: number; incasat: number }
): Promise<void> {
  const { error } = await supabase
    .from('cvr_billing')
    .upsert({ project_id: projectId, ...b }, { onConflict: 'project_id' })
  if (error) throw error
}

// ── Editarea joburilor ────────────────────────────────────────────────────
export async function updateJob(
  id: string,
  j: { name: string; startDate: string; endDate: string },
  budgets: Record<CostCategory, number>
): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({ name: j.name, start_date: j.startDate, end_date: j.endDate })
    .eq('id', id)
  if (error) throw error
  const rows = Object.entries(budgets).map(([category, amount]) => ({
    job_id: id,
    category,
    amount,
  }))
  const { error: bErr } = await supabase
    .from('cvr_job_budgets')
    .upsert(rows, { onConflict: 'job_id,category' })
  if (bErr) throw bErr
}

export async function deleteJob(id: string): Promise<void> {
  const { error } = await supabase.from('jobs').delete().eq('id', id)
  if (error) throw error
}

// ── Editarea taskurilor și livrabilelor ──────────────────────────────────
export async function updateTask(id: string, t: { name: string; value: number }): Promise<void> {
  const { error } = await supabase.from('tasks').update({ name: t.name, value: t.value }).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export interface DeliverablePatch {
  name: string
  um: string
  qtyTotal: number
  qtyDone: number
  weight: number
}

export async function updateDeliverable(id: string, d: DeliverablePatch): Promise<void> {
  const { error } = await supabase
    .from('deliverables')
    .update({ name: d.name, um: d.um, qty_total: d.qtyTotal, qty_done: d.qtyDone, weight: d.weight })
    .eq('id', id)
  if (error) throw error
}

export async function addDeliverable(taskId: string, d: DeliverablePatch, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('deliverables').insert({
    task_id: taskId,
    name: d.name,
    um: d.um,
    qty_total: d.qtyTotal,
    qty_done: d.qtyDone,
    weight: d.weight,
    sort_order: sortOrder,
  })
  if (error) throw error
}

export async function deleteDeliverable(id: string): Promise<void> {
  const { error } = await supabase.from('deliverables').delete().eq('id', id)
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

    // sincron P&L: proiectul nou apare și în lista de proiecte a aplicației P&L
    // (același id în ambele tabele), apoi se leagă prin pnl_proiect_id
    const { error: pnlErr } = await supabase
      .from('proiecte')
      .insert({ id: projectId, nume: p.name, activ: true })
    if (pnlErr) throw pnlErr
    const { error: linkErr } = await supabase
      .from('projects')
      .update({ pnl_proiect_id: projectId })
      .eq('id', projectId)
    if (linkErr) throw linkErr
  } catch (err) {
    // curățenie: cascade șterge tot ce s-a apucat să creeze
    // (inclusiv eventualul rând-oglindă din proiecte, creat cu același id)
    await supabase.from('proiecte').delete().eq('id', projectId)
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
