// Stratul de date: citește arborele Proiect → Joburi → Taskuri → Livrabile
// din Supabase și atașează KPI-urile calculate cu funcțiile pure din domain/kpi.
import { useCallback, useEffect, useState } from 'react'
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
      deliverables: t.deliverables.map((d) => ({
        qtyTotal: Number(d.qty_total),
        qtyDone: Number(d.qty_done),
        weight: Number(d.weight),
      })),
    })),
  }
}

function decorateProject(p: ProjectRow, today: string): ProjectWithKpis {
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
 * Recalculează KPI-urile de cost/marjă ale proiectelor folosind costul real din
 * P&L (când există) în locul costurilor manuale. „Bugetul câștigat" (buget × %
 * realizat) rămâne referința; costul devine cel din P&L.
 */
export function mergePnlCosts(
  projects: ProjectWithKpis[],
  costByProject: Map<string, PnlCosts>
): ProjectWithKpis[] {
  return projects.map((p) => {
    // costul din P&L se aplică DOAR proiectelor legate de P&L (pnl_proiect_id).
    // Proiectele demo/nelegate păstrează costurile manuale, ca să nu arate fals.
    if (!p.pnl_proiect_id) return p
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
  })
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
      id, name, value, status, sort_order, planned_man_days,
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

/** Hook React: lista proiectelor cu KPI-uri (cost real din P&L) + stare. */
export function useProjectTree() {
  const [projects, setProjects] = useState<ProjectWithKpis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchProjectTree()
      .then(async (tree) => {
        // costurile P&L sunt un plus: dacă RPC-ul eșuează, arătăm arborele fără ele
        try {
          const costs = await fetchPnlCosts()
          setProjects(mergePnlCosts(tree, costs))
        } catch {
          setProjects(tree)
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { projects, loading, error, refetch }
}
