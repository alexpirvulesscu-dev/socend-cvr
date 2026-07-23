// Stratul de date: citește arborele Proiect → Joburi → Taskuri → Livrabile
// din Supabase și atașează KPI-urile calculate cu funcțiile pure din domain/kpi.
// v3: starea stă într-un reducer cu `patchEntity` — actualizări optimiste pe un
// singur rând + recalcul local de KPI-uri, fără refetch de arbore la fiecare salvare.
import { useCallback, useEffect, useReducer } from 'react'
import { supabase } from '../lib/supabase'
import {
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
  | 'organizare'

/** Eticheta românească a fiecărei categorii de cost (în DB stau slug-uri ASCII). */
export const COST_CATEGORY_LABELS: Record<CostCategory, string> = {
  manopera: 'Manoperă',
  utilaje: 'Utilaje',
  materiale: 'Materiale',
  subcontractori: 'Subcontractori',
  organizare: 'Organizare',
}

export const COST_CATEGORIES: CostCategory[] = [
  'manopera',
  'utilaje',
  'materiale',
  'subcontractori',
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
  tasks: TaskRow[]
  cvr_job_budgets: BudgetRow[]
  cvr_cost_entries: CostRow[]
}

export interface BillingRow {
  depus: number
  certificat: number
  facturat: number
  incasat: number
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
  jobs: JobRow[]
  // PostgREST întoarce OBIECT pentru relația 1:1 (unique pe project_id).
  // Toleranța pentru array de mai jos NU e un caz real de date, ci o plasă de
  // siguranță pentru fereastra în care cache-ul de schemă PostgREST nu a
  // detectat încă constrângerea unique (imediat după migrări).
  cvr_billing: BillingRow | BillingRow[] | null
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

const EMPTY_BILLING: BillingInput = { depus: 0, certificat: 0, facturat: 0, incasat: 0 }

function sumByCategory(rows: { category: CostCategory; amount: number }[]) {
  const out = {
    manopera: 0,
    utilaje: 0,
    materiale: 0,
    subcontractori: 0,
    organizare: 0,
  } as Record<CostCategory, number>
  for (const r of rows) out[r.category] += Number(r.amount)
  return out
}

function toJobInput(job: JobRow): JobInput {
  return {
    startDate: job.start_date,
    endDate: job.end_date,
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
  const billing =
    (Array.isArray(p.cvr_billing) ? p.cvr_billing[0] : p.cvr_billing) ?? EMPTY_BILLING
  const billingInput: BillingInput = {
    depus: Number(billing.depus),
    certificat: Number(billing.certificat),
    facturat: Number(billing.facturat),
    incasat: Number(billing.incasat),
  }
  return {
    ...p,
    jobs,
    billing: billingInput,
    kpis: projectKpis(p.jobs.map(toJobInput), billingInput, today),
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
  return {
    ...p,
    pnlCosts: c,
    kpis: {
      ...p.kpis,
      actualCost: c.total,
      costVariance: earnedBudget - c.total,
      margin: ev > 0 ? (ev - c.total) / ev : 0,
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
  const base: ProjectWithKpis = {
    ...p,
    jobs,
    kpis: projectKpis(jobs.map(toJobInput), p.billing, today),
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
  id, name, client, billing_mode, contract_value, start_date, end_date, active, location, pnl_proiect_id, is_small, sort_order,
  jobs (
    id, name, start_date, end_date, sort_order,
    tasks (
      id, name, value, status, sort_order, planned_man_days, start_date, end_date,
      deliverables ( id, name, um, qty_total, qty_done, weight, sort_order, planned_man_days )
    ),
    cvr_job_budgets ( category, amount ),
    cvr_cost_entries ( id, category, amount, description, entry_date )
  ),
  cvr_billing ( depus, certificat, facturat, incasat )
`

/** Citește tot arborele, cu KPI-urile calculate la zi. */
export async function fetchProjectTree(): Promise<ProjectWithKpis[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(TREE_SELECT)
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
  | { kind: 'project'; id: string; patch: Partial<Omit<ProjectRow, 'jobs' | 'cvr_billing'>> }
  | { kind: 'billing'; id: string; patch: Partial<BillingInput> } // id = projectId
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
    case 'billing':
      return p.id === a.id ? { ...p, billing: { ...p.billing, ...a.patch } } : null
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
