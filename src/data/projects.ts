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
}

export interface TaskRow {
  id: string
  name: string
  value: number
  status: TaskStatus
  sort_order: number
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
  jobs: JobRow[]
  // PostgREST întoarce OBIECT (nu array) pentru relații 1:1 (unique pe project_id)
  cvr_billing: BillingRow | BillingRow[] | null
}

// ── Arborele îmbogățit cu KPI-uri ────────────────────────────────────────
export interface JobWithKpis extends JobRow {
  kpis: JobKpis
  budgetByCategory: Record<CostCategory, number>
  costByCategory: Record<CostCategory, number>
}

export interface ProjectWithKpis extends Omit<ProjectRow, 'jobs' | 'cvr_billing'> {
  jobs: JobWithKpis[]
  billing: BillingInput
  kpis: ProjectKpis
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
  }
}

const TREE_SELECT = `
  id, name, client, billing_mode, contract_value, start_date, end_date,
  jobs (
    id, name, start_date, end_date, sort_order,
    tasks (
      id, name, value, status, sort_order,
      deliverables ( id, name, um, qty_total, qty_done, weight, sort_order )
    ),
    cvr_job_budgets ( category, amount ),
    cvr_cost_entries ( id, category, amount, description, entry_date )
  ),
  cvr_billing ( depus, certificat, facturat, incasat )
`

/** Citește tot arborele, cu KPI-urile calculate la zi. */
export async function fetchProjectTree(): Promise<ProjectWithKpis[]> {
  const { data, error } = await supabase.from('projects').select(TREE_SELECT).order('name')
  if (error) throw error
  const today = todayIso()
  return ((data ?? []) as unknown as ProjectRow[]).map((p) => decorateProject(p, today))
}

/** Hook React: lista proiectelor cu KPI-uri + stare de încărcare/eroare. */
export function useProjectTree() {
  const [projects, setProjects] = useState<ProjectWithKpis[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchProjectTree()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { projects, loading, error, refetch }
}
