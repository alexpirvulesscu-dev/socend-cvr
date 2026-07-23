// Formulele KPI — implementare 1:1 după .claude/CLAUDE.md. NU improviza aici.
// Toate funcțiile sunt pure (fără Supabase, fără Date.now ascuns) ca să poată
// fi testate cu vectori exacți în kpi.test.ts.

// ── Tipuri de intrare (arborele proiectului, deja citit din Supabase) ─────
export type TaskStatus = 'neinceput' | 'in_lucru' | 'finalizat'

export interface DeliverableInput {
  qtyTotal: number
  qtyDone: number
  weight: number // pondere în task; suma pe task = 100
}

export interface TaskInput {
  value: number // valoarea contractată a taskului, lei
  status: TaskStatus
  deliverables: DeliverableInput[]
  // datele de plan ale taskului (v3, pentru Gantt); lipsă/null = taskul
  // moștenește fereastra jobului părinte — numeric identic cu formula veche
  startDate?: string | null
  endDate?: string | null
}

export interface JobInput {
  startDate: string // ISO yyyy-mm-dd
  endDate: string
  budgetTotal: number // suma bugetelor pe cele 5 categorii
  actualCost: number // suma costurilor reale înregistrate
  tasks: TaskInput[]
}

export interface BillingInput {
  depus: number
  certificat: number
  facturat: number
  incasat: number
}

// ── Formule de bază ───────────────────────────────────────────────────────

/** deliverable_pct = min(done / total, 1). Total 0 → 0. */
export function deliverablePct(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(done / total, 1)
}

/** task_pct = Σ(weight_i × deliverable_pct_i) / Σ(weight_i). Fără livrabile → 0. */
export function taskPct(deliverables: DeliverableInput[]): number {
  const weightSum = deliverables.reduce((s, d) => s + d.weight, 0)
  if (weightSum <= 0) return 0
  const weighted = deliverables.reduce(
    (s, d) => s + d.weight * deliverablePct(d.qtyDone, d.qtyTotal),
    0
  )
  return weighted / weightSum
}

/** EV (lucrări executate, lei) la nivel de task = task_value × task_pct. */
export function taskEV(task: TaskInput): number {
  return task.value * taskPct(task.deliverables)
}

/** EV la nivel de job = suma EV-urilor taskurilor. */
export function jobEV(job: JobInput): number {
  return job.tasks.reduce((s, t) => s + taskEV(t), 0)
}

/** Valoarea contractată a jobului = suma valorilor taskurilor. */
export function jobValue(job: JobInput): number {
  return job.tasks.reduce((s, t) => s + t.value, 0)
}

/** done_pct al unui job = EV / valoare (0 dacă valoarea e 0). */
export function jobDonePct(job: JobInput): number {
  const value = jobValue(job)
  if (value <= 0) return 0
  return jobEV(job) / value
}

/** Zile calendaristice între două date ISO (end − start). */
export function durationDays(startDate: string, endDate: string): number {
  const ms = Date.parse(endDate) - Date.parse(startDate)
  return ms / 86_400_000
}

/** plan_pct = clamp((today − start) / (end − start), 0, 1). Durată 0 → 1 după end, altfel 0. */
export function planPct(startDate: string, endDate: string, today: string): number {
  const total = Date.parse(endDate) - Date.parse(startDate)
  const elapsed = Date.parse(today) - Date.parse(startDate)
  if (total <= 0) return elapsed >= total ? 1 : 0
  return Math.min(Math.max(elapsed / total, 0), 1)
}

/** behind_days = (plan_pct − done_pct) × durata jobului în zile. Pozitiv = în urmă. */
export function behindDays(planPctValue: number, donePct: number, jobDurationDays: number): number {
  return (planPctValue - donePct) * jobDurationDays
}

/** cost_var = (buget_total × done_pct) − cost_real. Pozitiv = sub buget. */
export function costVariance(budgetTotal: number, donePct: number, actualCost: number): number {
  return budgetTotal * donePct - actualCost
}

/** margin = (EV − cost) / EV. EV 0 → 0. */
export function margin(ev: number, cost: number): number {
  if (ev <= 0) return 0
  return (ev - cost) / ev
}

/** WIP = max(0, EV − depus): lucrări executate încă nedepuse la decontare. */
export function wip(ev: number, depus: number): number {
  return Math.max(0, ev - depus)
}

/** cash_pct = încasat / facturat. Nimic facturat → 1 (nu există bani de așteptat). */
export function cashPct(incasat: number, facturat: number): number {
  if (facturat <= 0) return 1
  return incasat / facturat
}

// ── Agregări pe job și proiect ────────────────────────────────────────────

export interface JobKpis {
  value: number
  ev: number
  donePct: number
  planPct: number
  behindDays: number
  budgetTotal: number
  actualCost: number
  costVariance: number
  margin: number
}

/**
 * plan_pct al unui job, RAFINAT cu datele taskurilor (v3): media ponderată cu
 * valoarea a plan_pct-urilor taskurilor, fiecare task căzând pe fereastra
 * jobului când nu are date proprii. Fără taskuri (sau valoare 0) → formula
 * veche pe fereastra jobului. Taskurile backfill-uite cu fereastra jobului dau
 * EXACT același număr ca înainte — KPI-urile nu sar la migrare.
 */
export function jobPlanPct(job: JobInput, today: string): number {
  const value = jobValue(job)
  if (value <= 0) return planPct(job.startDate, job.endDate, today)
  let weighted = 0
  for (const t of job.tasks) {
    const start = t.startDate ?? job.startDate
    const end = t.endDate ?? job.endDate
    weighted += t.value * planPct(start, end, today)
  }
  return weighted / value
}

export function jobKpis(job: JobInput, today: string): JobKpis {
  const value = jobValue(job)
  const ev = jobEV(job)
  const donePct = jobDonePct(job)
  const plan = jobPlanPct(job, today)
  return {
    value,
    ev,
    donePct,
    planPct: plan,
    behindDays: behindDays(plan, donePct, durationDays(job.startDate, job.endDate)),
    budgetTotal: job.budgetTotal,
    actualCost: job.actualCost,
    costVariance: costVariance(job.budgetTotal, donePct, job.actualCost),
    margin: margin(ev, job.actualCost),
  }
}

export interface ProjectKpis {
  value: number
  ev: number // KPI 1: Lucrări executate, lei
  donePct: number
  planPct: number // media ponderată cu valoarea joburilor
  behindDays: number // KPI 2: media ponderată cu valoarea joburilor; pozitiv = în urmă
  actualCost: number
  costVariance: number // KPI 3: suma variațiilor joburilor; pozitiv = sub buget
  margin: number // KPI 4: (EV − cost) / EV pe totaluri
  cashPct: number // KPI 5: încasat / facturat
  wip: number // lucrări executate și nedepuse
}

export function projectKpis(jobs: JobInput[], billing: BillingInput, today: string): ProjectKpis {
  const value = jobs.reduce((s, j) => s + jobValue(j), 0)
  const ev = jobs.reduce((s, j) => s + jobEV(j), 0)
  const actualCost = jobs.reduce((s, j) => s + j.actualCost, 0)
  const costVar = jobs.reduce((s, j) => s + jobKpis(j, today).costVariance, 0)

  // Mediile de plan/grafic sunt ponderate cu valoarea fiecărui job
  let planWeighted = 0
  let behindWeighted = 0
  for (const j of jobs) {
    const k = jobKpis(j, today)
    planWeighted += k.planPct * k.value
    behindWeighted += k.behindDays * k.value
  }

  return {
    value,
    ev,
    donePct: value > 0 ? ev / value : 0,
    planPct: value > 0 ? planWeighted / value : 0,
    behindDays: value > 0 ? behindWeighted / value : 0,
    actualCost,
    costVariance: costVar,
    margin: margin(ev, actualCost),
    cashPct: cashPct(billing.incasat, billing.facturat),
    wip: wip(ev, billing.depus),
  }
}

// ── Culorile KPI (pragurile exacte din .claude/CLAUDE.md) ─────────────────
export type KpiColor = 'good' | 'warning' | 'error'

/** Grafic: sub 2 zile întârziere = bine, 2–7 = atenție, peste 7 = problemă. */
export function scheduleColor(behind: number): KpiColor {
  if (behind < 2) return 'good'
  if (behind <= 7) return 'warning'
  return 'error'
}

/** Cost: variație ≥ 0 (sub buget) = bine, altfel problemă. */
export function costColor(costVar: number): KpiColor {
  return costVar >= 0 ? 'good' : 'error'
}

/** Marjă: ≥ 15% bine, 8–15% atenție, sub 8% problemă. */
export function marginColor(m: number): KpiColor {
  if (m >= 0.15) return 'good'
  if (m >= 0.08) return 'warning'
  return 'error'
}

/** Cash: ≥ 90% încasat din facturat = bine, 70–90% atenție, sub 70% problemă. */
export function cashColor(c: number): KpiColor {
  if (c >= 0.9) return 'good'
  if (c >= 0.7) return 'warning'
  return 'error'
}
