// Datele pentru ecranele de șantier: DOAR taskurile care au manoperă azi,
// citite prin view-ul labour_today (regula de aur a aplicației).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { TaskStatus } from '../domain/kpi'
import type { DeliverableRow } from './projects'

/** La ce nivel i-a trimis Pontajul pe oameni: direct pe task, pe job, pe proiect. */
export type LabourLevel = 'task' | 'job' | 'project'

export interface LabourTask {
  taskId: string
  taskName: string
  status: TaskStatus
  workers: number
  /** Nivelul alocării: 'job'/'project' înseamnă că oamenii sunt pe zona din care
      face parte taskul, nu neapărat fix pe el. Interfața trebuie să o spună. */
  level: LabourLevel
  jobName: string
  projectName: string
  deliverables: DeliverableRow[]
}

/** Oamenii care rămân la nivel de proiect (proiecte fără joburi/taskuri —
    un caz normal: acolo orele se raportează pe proiect, ca întreg). */
export interface LabourProject {
  projectId: string
  projectName: string
  workers: number
  hasTasks: boolean
  /** ore consumate pe proiect de la început (din pontaj) */
  hours: number
}

interface TaskJoinRow {
  id: string
  name: string
  status: TaskStatus
  deliverables: DeliverableRow[]
  jobs: { name: string; projects: { name: string } | null } | null
}

/** Taskurile cu manoperă azi + livrabilele lor, gata de raportare. */
export async function fetchLabourToday(): Promise<LabourTask[]> {
  const { data: labour, error: labourErr } = await supabase
    .from('labour_today')
    .select('project_id, task_id, workers, level')
  if (labourErr) throw labourErr
  if (!labour || labour.length === 0) return []

  const taskIds = labour.map((l) => l.task_id as string)
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select(
      `id, name, status,
       deliverables ( id, name, um, qty_total, qty_done, weight, sort_order, planned_man_days ),
       jobs ( name, projects ( name ) )`
    )
    .in('id', taskIds)
  if (tasksErr) throw tasksErr

  const byTask = new Map(labour.map((l) => [l.task_id as string, l]))
  return ((tasks ?? []) as unknown as TaskJoinRow[]).map((t) => ({
    taskId: t.id,
    taskName: t.name,
    status: t.status,
    workers: (byTask.get(t.id)?.workers as number) ?? 0,
    level: ((byTask.get(t.id)?.level as LabourLevel) ?? 'project'),
    jobName: t.jobs?.name ?? '',
    projectName: t.jobs?.projects?.name ?? '',
    deliverables: [...t.deliverables].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

/** O linie de repartiție de azi: un om, la nivelul la care a fost trimis.
    Din ea se numără oamenii pe proiect, pe job și pe task, fără dublare —
    de aceea ecranul nu mai repetă „4 oameni" pe fiecare card frate. */
export interface AllocRow {
  workerId: string
  projectId: string
  jobId: string | null
  taskId: string | null
}

export async function fetchAllocToday(): Promise<AllocRow[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('labour_alloc')
    .select('worker_id, project_id, job_id, task_id')
    .eq('work_date', today)
  if (error) throw error
  return (data ?? []).map((r) => ({
    workerId: r.worker_id as string,
    projectId: r.project_id as string,
    jobId: (r.job_id as string | null) ?? null,
    taskId: (r.task_id as string | null) ?? null,
  }))
}

/** Câți oameni sunt azi pe un proiect / job / task, numărați o singură dată.
    `null` înseamnă „exact la acest nivel": { jobId: null, taskId: null } = oamenii
    trimiși pe proiect, fără job și fără task. */
export function countWorkers(
  rows: AllocRow[],
  where: { projectId?: string; jobId?: string | null; taskId?: string | null }
): number {
  const ids = new Set(
    rows
      .filter(
        (r) =>
          (where.projectId === undefined || r.projectId === where.projectId) &&
          (where.jobId === undefined || r.jobId === where.jobId) &&
          (where.taskId === undefined || r.taskId === where.taskId)
      )
      .map((r) => r.workerId)
  )
  return ids.size
}

/** Proiectele pe care azi sunt oameni, dar fără coborâre pe job/task.
    Pentru proiectele fără structură (fără joburi și taskuri) aceasta e singura
    lor apariție pe Șantier — se raportează pe proiect, cu orele consumate. */
export async function fetchLabourProjects(): Promise<LabourProject[]> {
  const [{ data: today, error: todayErr }, { data: hours, error: hoursErr }] = await Promise.all([
    supabase.from('labour_project_today').select('project_id, workers, has_tasks'),
    supabase.from('labour_project_hours').select('project_id, hours'),
  ])
  if (todayErr) throw todayErr
  if (hoursErr) throw hoursErr
  if (!today || today.length === 0) return []

  const ids = today.map((r) => r.project_id as string)
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name')
    .in('id', ids)
  if (projErr) throw projErr

  const nameById = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]))
  const hoursById = new Map((hours ?? []).map((h) => [h.project_id as string, Number(h.hours)]))

  return today.map((r) => ({
    projectId: r.project_id as string,
    projectName: nameById.get(r.project_id as string) ?? '',
    workers: Number(r.workers),
    hasTasks: Boolean(r.has_tasks),
    hours: hoursById.get(r.project_id as string) ?? 0,
  }))
}

export function useLabourToday() {
  const [tasks, setTasks] = useState<LabourTask[]>([])
  const [projects, setProjects] = useState<LabourProject[]>([])
  const [alloc, setAlloc] = useState<AllocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([fetchLabourToday(), fetchLabourProjects(), fetchAllocToday()])
      .then(([t, p, a]) => {
        setTasks(t)
        setProjects(p)
        setAlloc(a)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { tasks, projects, alloc, loading, error, refetch }
}

/** Salvează ziua: RPC-ul face insert + increment done atomic, într-o tranzacție. */
export async function closeDay(
  entries: { deliverable_id: string; qty: number }[]
): Promise<void> {
  const { error } = await supabase.rpc('cvr_close_day', {
    entries: entries.filter((e) => e.qty > 0),
  })
  if (error) throw error
}

// ── Progresul lucrărilor pentru șantier (FĂRĂ bani pe ecran) ─────────────
// Citește doar scheletul: proiecte → joburi → taskuri → livrabile.
// Valorile taskurilor sunt folosite numai la ponderarea procentelor,
// niciodată afișate în ecranele de șantier.
export interface ProgressTask {
  id: string
  name: string
  status: TaskStatus
  value: number
  sort_order: number
  deliverables: DeliverableRow[]
}

export interface ProgressJob {
  id: string
  name: string
  start_date: string
  end_date: string
  sort_order: number
  tasks: ProgressTask[]
}

export interface ProgressProject {
  id: string
  name: string
  jobs: ProgressJob[]
}

export async function fetchSkeletonProgress(): Promise<ProgressProject[]> {
  const { data, error } = await supabase
    .from('projects')
    .select(
      `id, name,
       jobs (
         id, name, start_date, end_date, sort_order,
         tasks (
           id, name, status, value, sort_order,
           deliverables ( id, name, um, qty_total, qty_done, weight, sort_order, planned_man_days )
         )
       )`
    )
    .eq('active', true) // proiectele finalizate nu apar pe șantier
    .eq('is_overhead', false) // paza nu e lucrare — nu se raportează nimic pe ea
    .order('name')
  if (error) throw error
  return ((data ?? []) as unknown as ProgressProject[]).map((p) => ({
    ...p,
    jobs: [...p.jobs]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((j) => ({
        ...j,
        tasks: [...j.tasks]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((t) => ({
            ...t,
            deliverables: [...t.deliverables].sort((a, b) => a.sort_order - b.sort_order),
          })),
      })),
  }))
}

export function useSkeletonProgress() {
  const [projects, setProjects] = useState<ProgressProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSkeletonProgress()
      .then(setProjects)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return { projects, loading, error }
}
