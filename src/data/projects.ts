// Stratul de date: citește arborele Proiect → Joburi → Taskuri → Livrabile
// din Supabase și atașează KPI-urile calculate cu funcțiile pure din domain/kpi.
// v3: starea stă într-un reducer cu `patchEntity` — actualizări optimiste pe un
// singur rând + recalcul local de KPI-uri, fără refetch de arbore la fiecare salvare.
import { useCallback, useEffect, useReducer } from 'react'
import { supabase } from '../lib/supabase'
import {
  eacCost,
  forecastMargin,
  jobKpis,
  projectKpis,
  type BillingInput,
  type JobInput,
  type JobKpis,
  type ProjectKpis,
  type TaskStatus,
} from '../domain/kpi'

// ── Tipurile rândurilor din DB (snake_case, exact ca în Postgres) ────────
export type CostCategory =
  | 'manopera'
  | 'utilaje'
  | 'materiale'
  | 'subcontractori'
  | 'transport'
  | 'organizare'

/** Eticheta românească a fiecărei categorii de cost (în DB stau slug-uri ASCII). */
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  manopera: 'Manoperă',
  utilaje: 'Utilaje',
  materiale: 'Materiale',
  subcontractori: 'Subcontractori',
  transport: 'Transport',
  organizare: 'Organizare',
}

export const COST_CATEGORIES: CostCategory[] = [
  'manopera',
  'utilaje',
  'materiale',
  'subcontractori',
  'transport',
  'organizare',
]

/** Eticheta românească a statusului de task. */
export const STATUS_LABELS: Record<TaskStatus, string> = {
  neinceput: 'Neînceput',
  in_lucru: 'În lucru',
  finalizat: 'Finalizat',
}

export interface DeliverableRow {
  id: string
  name: string
  um: string
  qty_total: number
  qty_done: number
  weight: number
  sort_order: number
  planned_man_days: number | null
}

export interface TaskRow {
  id: string
  name: string
  value: number
  status: TaskStatus
  sort_order: number
  planned_man_days: number | null
  // datele de plan pentru Gantt (0014); null = task fără plan propriu,
  // moștenește vizual fereastra jobului părinte
  start_date: string | null
  end_date: string | null
  // data-țintă la care planificăm să facturăm taskul (0016); null = neplanificat
  target_invoice_date: string | null
  deliverables: DeliverableRow[]
}

export interface BudgetRow {
  category: CostCategory
  amount: number
}

export interface CostRow {
  id: string
  category: CostCategory
  amount: number
  description: string | null
  entry_date: string
}

export interface JobRow {
  id: string
  name: string
  start_date: string
  end_date: string
  sort_order: number
  // orele de manoperă alocate jobului (0023); null = se însumează taskurile
  planned_hours: number | null
  // planul INIȚIAL, înghețat la creare (0017); nu se schimbă din Gantt
  baseline_start_date: string | null
  baseline_end_date: string | null
  tasks: TaskRow[]
  cvr_job_budgets: BudgetRow[]
  cvr_cost_entries: CostRow[]
  // situația de lucrări a jobului (0017). Vezi nota de toleranță de la ProjectRow.
  cvr_job_billing: BillingRow | BillingRow[] | null
}

export interface BillingRow {
  depus: number
  certificat: number
  facturat: number
  incasat: number
  /** data ultimei facturi a jobului (0019) — pentru vechimea banilor neîncasați */
  data_facturii?: string | null
  /** data la care vrem să facturăm jobul (0020); taskurile fără țintă proprie o moștenesc */
  target_invoice_date?: string | null
}

const EMPTY_BILLING: BillingInput = { depus: 0, certificat: 0, facturat: 0, incasat: 0 }

/** Rândul de situație al unui job, normalizat (PostgREST dă când obiect, când array). */
export function billingRowOf(
  row: BillingRow | BillingRow[] | null | undefined
): BillingRow | undefined {
  return (Array.isArray(row) ? row[0] : row) ?? undefined
}

/** Data la care vrem să facturăm jobul (0020); null = neplanificată. */
export function jobTargetInvoiceDate(job: {
  cvr_job_billing: BillingRow | BillingRow[] | null
}): string | null {
  return billingRowOf(job.cvr_job_billing)?.target_invoice_date ?? null
}

/**
 * Ținta de facturare a unui task: a lui, dacă are una; altfel a jobului.
 * Regula stă AICI, într-un singur loc, ca „Ce urmează", Dashboard-ul, Gantt-ul
 * și cardul de detaliu să spună toate aceeași dată.
 */
export function taskTargetInvoiceDate(
  task: { target_invoice_date: string | null },
  job: { cvr_job_billing: BillingRow | BillingRow[] | null }
): string | null {
  return task.target_invoice_date ?? jobTargetInvoiceDate(job)
}

/** PostgREST dă obiect pentru relația 1:1; array-ul e plasa de siguranță post-migrare. */
export function billingOf(row: BillingRow | BillingRow[] | null | undefined): BillingInput {
  const b = (Array.isArray(row) ? row[0] : row) ?? EMPTY_BILLING
  return {
    depus: Number(b.depus),
    certificat: Number(b.certificat),
    facturat: Number(b.facturat),
    incasat: Number(b.incasat),
  }
}

export interface ProjectRow {
  id: string
  name: string
  client: string | null
  billing_mode: string
  contract_value: number
  start_date: string | null
  end_date: string | null
  active: boolean
  location: string | null
  pnl_proiect_id: string | null
  is_small: boolean
  sort_order: number
  /** garanția de bună execuție reținută de client, în procente (0019) */
  retentie_pct: number
  /** orele de manoperă alocate proiectului la deschidere (0023) */
  planned_hours: number | null
  jobs: JobRow[]
  // Facturarea NU mai stă pe proiect: e suma situațiilor joburilor (0017).
  // Tabelul `cvr_billing` rămâne în DB ca istoric, dar nu se mai citește.
}

// ── Arborele îmbogățit cu KPI-uri ────────────────────────────────────────
export interface JobWithKpis extends JobRow {
  kpis: JobKpis
  budgetByCategory: Record<CostCategory, number>
  costByCategory: Record<CostCategory, number>
}

/** Costul real dedus din P&L, pe cele 6 categorii CVR. */
export interface PnlCosts {
  manopera: number
  materiale: number
  subcontractori: number
  combustibil: number
  echipamente: number
  overheads: number
  total: number
}

export interface ProjectWithKpis extends Omit<ProjectRow, 'jobs' | 'cvr_billing'> {
  jobs: JobWithKpis[]
  billing: BillingInput
  kpis: ProjectKpis
  // costul real din P&L (null până se încarcă); când e prezent, KPI-urile de
  // cost/marjă ale proiectului sunt recalculate cu el, nu cu costurile manuale.
  pnlCosts: PnlCosts | null
}

/** Data de azi în format ISO (yyyy-mm-dd), folosită de plan_pct. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function sumByCategory(rows: { category: CostCategory; amount: number }[]) {
  const out = {
    manopera: 0,
    utilaje: 0,
    materiale: 0,
    subcontractori: 0,
    transport: 0,
    organizare: 0,
  } as Record<CostCategory, number>
  for (const r of rows) out[r.category] += Number(r.amount)
  return out
}

function toJobInput(job: JobRow): JobInput {
  return {
    startDate: job.start_date,
    endDate: job.end_date,
    baselineEndDate: job.baseline_end_date,
    billing: billingOf(job.cvr_job_billing),
    budgetTotal: job.cvr_job_budgets.reduce((s, b) => s + Number(b.amount), 0),
    actualCost: job.cvr_cost_entries.reduce((s, c) => s + Number(c.amount), 0),
    tasks: job.tasks.map((t) => ({
      value: Number(t.value),
      status: t.status,
      startDate: t.start_date,
      endDate: t.end_date,
      deliverables: t.deliverables.map((d) => ({
        qtyTotal: Number(d.qty_total),
        qtyDone: Number(d.qty_done),
        weight: Number(d.weight),
      })),
    })),
  }
}

/** Sortează nivelele și calculează KPI-urile unui proiect citit din DB. (exportat pentru teste) */
export function decorateProject(p: ProjectRow, today: string): ProjectWithKpis {
  const jobs = [...p.jobs]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((j) => ({
      ...j,
      tasks: [...j.tasks]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({
          ...t,
          deliverables: [...t.deliverables].sort((a, b) => a.sort_order - b.sort_order),
        })),
      kpis: jobKpis(toJobInput(j), today),
      budgetByCategory: sumByCategory(j.cvr_job_budgets),
      costByCategory: sumByCategory(j.cvr_cost_entries),
    }))
  // facturarea proiectului = suma situațiilor joburilor (0017)
  const kpis = projectKpis(jobs.map(toJobInput), today)
  return {
    ...p,
    jobs,
    billing: kpis.billing,
    kpis,
    pnlCosts: null,
  }
}

/**
 * Aplică pe UN proiect costul real din P&L (când există). „Bugetul câștigat"
 * (buget × % realizat) rămâne referința; costul devine cel din P&L.
 * Costul din P&L se aplică DOAR proiectelor legate de P&L (pnl_proiect_id) —
 * proiectele demo/nelegate păstrează costurile manuale, ca să nu arate fals.
 */
function applyPnlCost(
  p: ProjectWithKpis,
  costByProject: Map<string, PnlCosts> | null
): ProjectWithKpis {
  if (!costByProject || !p.pnl_proiect_id) return p
  const c = costByProject.get(p.id)
  if (!c) return p
  const earnedBudget = p.kpis.costVariance + p.kpis.actualCost // buget × %realizat
  const ev = p.kpis.ev
  // prognoza trebuie refăcută cu costul REAL din P&L, nu cu cel manual
  const eac = eacCost(c.total, p.kpis.donePct)
  return {
    ...p,
    pnlCosts: c,
    kpis: {
      ...p.kpis,
      actualCost: c.total,
      costVariance: earnedBudget - c.total,
      margin: ev > 0 ? (ev - c.total) / ev : 0,
      eacCost: eac,
      forecastMargin: forecastMargin(p.kpis.value, eac),
    },
  }
}

/** Varianta pe listă (folosită la încărcare și în teste). */
export function mergePnlCosts(
  projects: ProjectWithKpis[],
  costByProject: Map<string, PnlCosts>
): ProjectWithKpis[] {
  return projects.map((p) => applyPnlCost(p, costByProject))
}

/**
 * Recalculează KPI-urile unui proiect DUPĂ un patch local (fără refetch):
 * re-sortează nivelele, re-rulează funcțiile pure de KPI și re-aplică costul
 * din P&L păstrat în memorie. Ieftin — se rulează doar pe proiectul atins.
 */
export function redecorateProject(
  p: ProjectWithKpis,
  pnlMap: Map<string, PnlCosts> | null,
  today: string
): ProjectWithKpis {
  const jobs = [...p.jobs]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((j) => ({
      ...j,
      tasks: [...j.tasks]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((t) => ({
          ...t,
          deliverables: [...t.deliverables].sort((a, b) => a.sort_order - b.sort_order),
        })),
      kpis: jobKpis(toJobInput(j), today),
      budgetByCategory: sumByCategory(j.cvr_job_budgets),
      costByCategory: sumByCategory(j.cvr_cost_entries),
    }))
  const kpis = projectKpis(jobs.map(toJobInput), today)
  const base: ProjectWithKpis = {
    ...p,
    jobs,
    billing: kpis.billing, // rollup din situațiile joburilor
    kpis,
    pnlCosts: null,
  }
  return applyPnlCost(base, pnlMap)
}

/** Costurile din P&L, pe proiect (RPC security-definer, doar admin/finance). */
export async function fetchPnlCosts(): Promise<Map<string, PnlCosts>> {
  const { data, error } = await supabase.rpc('cvr_project_pnl_costs')
  if (error) throw error
  const map = new Map<string, PnlCosts>()
  for (const r of data ?? []) {
    const manopera = Number(r.manopera)
    const materiale = Number(r.materiale)
    const subcontractori = Number(r.subcontractori)
    const combustibil = Number(r.combustibil)
    const echipamente = Number(r.echipamente)
    const overheads = Number(r.overheads)
    map.set(r.project_id as string, {
      manopera,
      materiale,
      subcontractori,
      combustibil,
      echipamente,
      overheads,
      total: manopera + materiale + subcontractori + combustibil + echipamente + overheads,
    })
  }
  return map
}

const TREE_SELECT = `
  id, name, client, billing_mode, contract_value, start_date, end_date, active, location, pnl_proiect_id, is_small, sort_order, retentie_pct, planned_hours,
  jobs (
    id, name, start_date, end_date, sort_order, baseline_start_date, baseline_end_date, planned_hours,
    tasks (
      id, name, value, status, sort_order, planned_man_days, start_date, end_date, target_invoice_date,
      deliverables ( id, name, um, qty_total, qty_done, weight, sort_order, planned_man_days )
    ),
    cvr_job_budgets ( category, amount ),
    cvr_cost_entries ( id, category, amount, description, entry_date ),
    cvr_job_billing ( depus, certificat, facturat, incasat, data_facturii, target_invoice_date )
  )
`

/** Citește tot arborele, cu KPI-urile calculate la zi.
    Proiectele de regie (is_overhead: paza) nu sunt lucrări și nu apar în CVR —
    costul lor merge la overheads, iar Pontajul le folosește mai departe. */
export async function fetchProjectTree(): Promise<ProjectWithKpis[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(TREE_SELECT)
    // Proiectele de regie (paza) nu sunt lucrări: costul lor merge la overheads,
    // iar Pontajul le folosește mai departe. În CVR nu apar deloc.
    .eq('is_overhead', false)
    .order('sort_order')
    .order('name')
  if (error) throw error
  const today = todayIso()
  return ((data ?? []) as unknown as ProjectRow[]).map((p) => decorateProject(p, today))
}

// ── Reducer-ul arborelui + patch-uri optimiste ───────────────────────────

/**
 * Un patch optimist pe UN rând din arbore. Se aplică imediat în memorie
 * (KPI-urile proiectului atins se recalculează local), iar persistarea în
 * Supabase se face separat, în fundal. La eroare: se aplică patch-ul invers
 * (apelantul cunoaște valorile vechi) + toast.
 */
export type EntityPatch =
  | { kind: 'project'; id: string; patch: Partial<Omit<ProjectRow, 'jobs'>> }
  | {
      kind: 'billing'
      id: string // = jobId (situația jobului)
      patch: Partial<BillingInput & { data_facturii: string | null; target_invoice_date: string | null }>
    }
  | { kind: 'job'; id: string; patch: Partial<Omit<JobRow, 'tasks'>> }
  | { kind: 'task'; id: string; patch: Partial<TaskRow> }
  | { kind: 'deliverable'; id: string; patch: Partial<DeliverableRow> }

export interface TreeState {
  projects: ProjectWithKpis[]
  loading: boolean
  error: string | null
  // costurile P&L păstrate în memorie, ca redecorateProject să le poată
  // re-aplica după fiecare patch fără să re-cheme RPC-ul
  pnlMap: Map<string, PnlCosts> | null
}

export type TreeAction =
  | { type: 'loading' }
  | { type: 'loaded'; projects: ProjectWithKpis[]; pnlMap: Map<string, PnlCosts> | null }
  | { type: 'error'; message: string }
  | { type: 'patched'; patch: EntityPatch; today: string }

/** Aplică un patch pe un proiect. Întoarce null dacă entitatea nu e în acest proiect. */
function patchProject(p: ProjectWithKpis, a: EntityPatch): ProjectWithKpis | null {
  switch (a.kind) {
    case 'project':
      return p.id === a.id ? { ...p, ...a.patch } : null
    case 'billing': {
      // situația de lucrări a UNUI job; totalul proiectului se recalculează în redecorate
      if (!p.jobs.some((j) => j.id === a.id)) return null
      return {
        ...p,
        jobs: p.jobs.map((j) => {
          if (j.id !== a.id) return j
          const raw = Array.isArray(j.cvr_job_billing) ? j.cvr_job_billing[0] : j.cvr_job_billing
          // pornim de la rândul BRUT, ca `data_facturii` să nu se piardă la patch
          return {
            ...j,
            cvr_job_billing: { ...raw, ...billingOf(j.cvr_job_billing), ...a.patch },
          }
        }),
      }
    }
    case 'job': {
      if (!p.jobs.some((j) => j.id === a.id)) return null
      return { ...p, jobs: p.jobs.map((j) => (j.id === a.id ? { ...j, ...a.patch } : j)) }
    }
    case 'task': {
      if (!p.jobs.some((j) => j.tasks.some((t) => t.id === a.id))) return null
      return {
        ...p,
        jobs: p.jobs.map((j) =>
          j.tasks.some((t) => t.id === a.id)
            ? { ...j, tasks: j.tasks.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) }
            : j
        ),
      }
    }
    case 'deliverable': {
      const has = (t: TaskRow) => t.deliverables.some((d) => d.id === a.id)
      if (!p.jobs.some((j) => j.tasks.some(has))) return null
      return {
        ...p,
        jobs: p.jobs.map((j) =>
          j.tasks.some(has)
            ? {
                ...j,
                tasks: j.tasks.map((t) =>
                  has(t)
                    ? {
                        ...t,
                        deliverables: t.deliverables.map((d) =>
                          d.id === a.id ? { ...d, ...a.patch } : d
                        ),
                      }
                    : t
                ),
              }
            : j
        ),
      }
    }
  }
}

/** Reducer pur (exportat pentru teste). Proiectele neatinse își păstrează identitatea. */
export function treeReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case 'loading':
      return { ...state, loading: true, error: null }
    case 'loaded':
      return { projects: action.projects, loading: false, error: null, pnlMap: action.pnlMap }
    case 'error':
      return { ...state, loading: false, error: action.message }
    case 'patched':
      return {
        ...state,
        projects: state.projects.map((p) => {
          const patched = patchProject(p, action.patch)
          return patched ? redecorateProject(patched, state.pnlMap, action.today) : p
        }),
      }
  }
}

/** Hook React: lista proiectelor cu KPI-uri (cost real din P&L) + stare + patch optimist. */
export function useProjectTree() {
  const [state, dispatch] = useReducer(treeReducer, {
    projects: [],
    loading: true,
    error: null,
    pnlMap: null,
  })

  const refetch = useCallback(() => {
    dispatch({ type: 'loading' })
    fetchProjectTree()
      .then(async (tree) => {
        // costurile P&L sunt un plus: dacă RPC-ul eșuează, arătăm arborele fără ele
        let pnlMap: Map<string, PnlCosts> | null = null
        try {
          pnlMap = await fetchPnlCosts()
        } catch {
          pnlMap = null
        }
        dispatch({
          type: 'loaded',
          projects: pnlMap ? mergePnlCosts(tree, pnlMap) : tree,
          pnlMap,
        })
      })
      .catch((e: Error) => dispatch({ type: 'error', message: e.message }))
  }, [])

  /** Patch optimist: aplică imediat în memorie și recalculează KPI-urile local. */
  const patchEntity = useCallback((patch: EntityPatch) => {
    dispatch({ type: 'patched', patch, today: todayIso() })
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return {
    projects: state.projects,
    loading: state.loading,
    error: state.error,
    refetch,
    patchEntity,
  }
}
