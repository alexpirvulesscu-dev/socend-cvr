// Scrieri în Supabase folosite de ecranele de birou.
// Ștergerile de aici sunt permise: ating DOAR rânduri create de acest proiect
// (curățenia unui proiect abia creat, la eșec de salvare).
import { supabase } from '../lib/supabase'
import type { TaskStatus } from '../domain/kpi'
import type { CostCategory, CostRow } from './projects'

/**
 * Adaugă un cost real pe un job (formularul „Adaugă cost").
 * Întoarce rândul creat, ca UI-ul să-l poată insera local (patch optimist) în loc
 * să re-citească tot arborele — altfel operația asta ar încetini pe măsură ce se
 * adună istoricul de costuri.
 */
export async function addCostEntry(
  jobId: string,
  entry: { category: CostCategory; amount: number; description: string; entryDate: string }
): Promise<CostRow> {
  const { data, error } = await supabase
    .from('cvr_cost_entries')
    .insert({
      job_id: jobId,
      category: entry.category,
      amount: entry.amount,
      description: entry.description || null,
      entry_date: entry.entryDate,
    })
    .select('id, category, amount, description, entry_date')
    .single()
  if (error) throw error
  return data as CostRow
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
  isSmall: boolean
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
      is_small: p.isSmall,
    })
    .eq('id', id)
  if (error) throw error
  await syncPnl(pnlId, { nume: p.name })
}

/**
 * Persistă ordinea (drag & drop) într-o SINGURĂ cerere, prin RPC tranzacțional.
 * Varianta veche trimitea câte un UPDATE pe rând: dacă pica cererea a 7-a dintr-a
 * 15, ordinea rămânea salvată pe jumătate, fără ca cineva să afle.
 */
async function setOrder(table: 'projects' | 'jobs' | 'tasks', idsInOrder: string[]): Promise<void> {
  if (idsInOrder.length === 0) return
  const { error } = await supabase.rpc('cvr_set_sort_order', {
    p_table: table,
    p_ids: idsInOrder,
  })
  if (error) throw error
}

/** Persistă ordinea manuală (drag & drop) a proiectelor. */
export async function setProjectsOrder(idsInOrder: string[]): Promise<void> {
  await setOrder('projects', idsInOrder)
}

/** Persistă ordinea joburilor în cadrul unui proiect (drag & drop în coloană). */
export async function setJobsOrder(idsInOrder: string[]): Promise<void> {
  await setOrder('jobs', idsInOrder)
}

/** Persistă ordinea taskurilor în cadrul unui job (drag & drop în coloană). */
export async function setTasksOrder(idsInOrder: string[]): Promise<void> {
  await setOrder('tasks', idsInOrder)
}

/** O singură celulă de buget a unui job (editare inline în „Buget vs cost"). */
export async function updateJobBudget(
  jobId: string,
  category: CostCategory,
  amount: number
): Promise<void> {
  const { error } = await supabase
    .from('cvr_job_budgets')
    .upsert({ job_id: jobId, category, amount }, { onConflict: 'job_id,category' })
  if (error) throw error
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

/**
 * Situația de lucrări a unui JOB (Situație probată → Certificat → Facturat →
 * Încasat). Facturarea stă pe job (0017); totalul proiectului e suma joburilor.
 * Upsert: dacă jobul n-are încă rând de facturare, se creează la prima editare.
 */
export async function updateJobBilling(
  jobId: string,
  b: { depus: number; certificat: number; facturat: number; incasat: number },
  dataFacturii?: string | null
): Promise<void> {
  const row: Record<string, unknown> = { job_id: jobId, ...b }
  // se trimite doar când apelantul chiar o schimbă (undefined = las-o cum e)
  if (dataFacturii !== undefined) row.data_facturii = dataFacturii
  const { error } = await supabase
    .from('cvr_job_billing')
    .upsert(row, { onConflict: 'job_id' })
  if (error) throw error
}

/**
 * Data-țintă de facturare a jobului (0020). Upsert pe job_id, ca situația să
 * existe chiar dacă jobul n-a fost încă facturat.
 */
export async function updateJobTargetInvoiceDate(
  jobId: string,
  date: string | null
): Promise<void> {
  const { error } = await supabase
    .from('cvr_job_billing')
    .upsert({ job_id: jobId, target_invoice_date: date }, { onConflict: 'job_id' })
  if (error) throw error
}

/** Garanția de bună execuție reținută de client, în procente (0019). */
export async function updateProjectRetention(id: string, retentiePct: number): Promise<void> {
  const { error } = await supabase
    .from('projects')
    .update({ retentie_pct: retentiePct })
    .eq('id', id)
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

/** Adaugă un job nou pe un proiect EXISTENT. Întoarce id-ul, ca UI-ul să îl poată selecta. */
export async function addJob(
  projectId: string,
  j: { name: string; startDate: string; endDate: string },
  budgets: Record<CostCategory, number>,
  sortOrder: number
): Promise<string> {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      project_id: projectId,
      name: j.name,
      start_date: j.startDate,
      end_date: j.endDate,
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (error) throw error
  const rows = Object.entries(budgets)
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({ job_id: data.id as string, category, amount }))
  if (rows.length > 0) {
    const { error: bErr } = await supabase.from('cvr_job_budgets').insert(rows)
    if (bErr) throw bErr
  }
  return data.id as string
}

/** Adaugă un task nou (cu livrabilele lui) pe un job EXISTENT. Întoarce id-ul. */
export async function addTask(
  jobId: string,
  t: { name: string; value: number },
  deliverables: DeliverablePatch[],
  sortOrder: number
): Promise<string> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ job_id: jobId, name: t.name, value: t.value, sort_order: sortOrder })
    .select('id')
    .single()
  if (error) throw error
  if (deliverables.length > 0) {
    const { error: dErr } = await supabase.from('deliverables').insert(
      deliverables.map((d, i) => ({
        task_id: data.id as string,
        name: d.name,
        um: d.um,
        qty_total: d.qtyTotal,
        qty_done: d.qtyDone,
        weight: d.weight,
        planned_man_days: d.plannedManDays,
        sort_order: i + 1,
      }))
    )
    if (dErr) throw dErr
  }
  return data.id as string
}

// ── Mutații ÎNGUSTE de date (Gantt + editare inline) ─────────────────────
// Separate deliberat de updateJob/updateTask: barele din Gantt scriu DOAR
// datele, fără să tragă după ele bugetele sau alte câmpuri.

/** Doar fereastra de plan a unui job. NU atinge bugetele (spre deosebire de updateJob). */
export async function updateJobDates(id: string, startDate: string, endDate: string): Promise<void> {
  const { error } = await supabase
    .from('jobs')
    .update({ start_date: startDate, end_date: endDate })
    .eq('id', id)
  if (error) throw error
}

/** Doar fereastra de plan a unui task (bara lui din Gantt). null = fără plan propriu. */
export async function updateTaskDates(
  id: string,
  startDate: string | null,
  endDate: string | null
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ start_date: startDate, end_date: endDate })
    .eq('id', id)
  if (error) throw error
}

/** Data-țintă de facturare a taskului (0016). null = neplanificat. */
export async function updateTaskInvoiceDate(id: string, date: string | null): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ target_invoice_date: date })
    .eq('id', id)
  if (error) throw error
}

/**
 * Mutarea unui job cu tot cu taskurile lui (drag pe bara de job în Gantt).
 * Apelantul calculează noile date; aici doar se persistă tot lotul.
 */
export async function shiftJobWithTasks(
  jobId: string,
  jobDates: { startDate: string; endDate: string },
  // null = latura respectivă rămâne „ca jobul" (nu se scrie o dată concretă)
  taskDates: { id: string; startDate: string | null; endDate: string | null }[]
): Promise<void> {
  await updateJobDates(jobId, jobDates.startDate, jobDates.endDate)
  await Promise.all(taskDates.map((t) => updateTaskDates(t.id, t.startDate, t.endDate)))
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
  plannedManDays: number | null
}

export async function updateDeliverable(id: string, d: DeliverablePatch): Promise<void> {
  const { error } = await supabase
    .from('deliverables')
    .update({
      name: d.name,
      um: d.um,
      qty_total: d.qtyTotal,
      qty_done: d.qtyDone,
      weight: d.weight,
      planned_man_days: d.plannedManDays,
    })
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
    planned_man_days: d.plannedManDays,
    sort_order: sortOrder,
  })
  if (error) throw error
}

export async function deleteDeliverable(id: string): Promise<void> {
  const { error } = await supabase.from('deliverables').delete().eq('id', id)
  if (error) throw error
}

// ── Duplicare (taskurile și joburile similare se copiază, nu se rescriu) ──
// Copia pornește de la zero: status neînceput, cantități realizate 0.

interface TaskLike {
  name: string
  value: number
  planned_man_days?: number | null
  start_date?: string | null
  end_date?: string | null
  deliverables: {
    name: string
    um: string
    qty_total: number
    weight: number
    sort_order: number
    planned_man_days?: number | null
  }[]
}

async function insertTaskCopy(jobId: string, t: TaskLike, name: string, sortOrder: number) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      job_id: jobId,
      name,
      value: t.value,
      planned_man_days: t.planned_man_days ?? null,
      // copia păstrează planul de timp al originalului (șablon de planificare)
      start_date: t.start_date ?? null,
      end_date: t.end_date ?? null,
      status: 'neinceput',
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (error) throw error
  if (t.deliverables.length > 0) {
    const { error: dErr } = await supabase.from('deliverables').insert(
      t.deliverables.map((d) => ({
        task_id: data.id as string,
        name: d.name,
        um: d.um,
        qty_total: d.qty_total,
        qty_done: 0,
        weight: d.weight,
        planned_man_days: d.planned_man_days ?? null,
        sort_order: d.sort_order,
      }))
    )
    if (dErr) throw dErr
  }
}

export async function duplicateTask(jobId: string, t: TaskLike, sortOrder: number): Promise<void> {
  await insertTaskCopy(jobId, t, `${t.name} (copie)`, sortOrder)
}

export async function duplicateJob(
  projectId: string,
  job: {
    name: string
    start_date: string
    end_date: string
    tasks: TaskLike[]
    budgets: Record<CostCategory, number>
  },
  sortOrder: number
): Promise<void> {
  const { data, error } = await supabase
    .from('jobs')
    .insert({
      project_id: projectId,
      name: `${job.name} (copie)`,
      start_date: job.start_date,
      end_date: job.end_date,
      sort_order: sortOrder,
    })
    .select('id')
    .single()
  if (error) throw error
  const jobId = data.id as string

  const budgetRows = Object.entries(job.budgets)
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({ job_id: jobId, category, amount }))
  if (budgetRows.length > 0) {
    const { error: bErr } = await supabase.from('cvr_job_budgets').insert(budgetRows)
    if (bErr) throw bErr
  }

  for (const [i, t] of job.tasks.entries()) {
    await insertTaskCopy(jobId, t, t.name, i + 1)
  }
}

// ── Crearea unui proiect nou (wizard-ul Configurare) ─────────────────────
export interface NewDeliverable {
  name: string
  um: string
  qtyTotal: number
  weight: number
  plannedManDays: number | null
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
  isSmall: boolean
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
      is_small: p.isSmall,
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
          planned_man_days: d.plannedManDays,
          sort_order: di + 1,
        }))
        if (delivRows.length > 0) {
          const { error: delErr } = await supabase.from('deliverables').insert(delivRows)
          if (delErr) throw delErr
        }
      }
    }

    // facturarea stă pe joburi (0017) și se creează la prima editare (upsert),
    // deci nu mai e nimic de inițializat aici

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
