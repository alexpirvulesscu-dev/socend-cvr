// Datele pentru ecranele de șantier: DOAR taskurile care au manoperă azi,
// citite prin view-ul labour_today (regula de aur a aplicației).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { TaskStatus } from '../domain/kpi'
import type { DeliverableRow } from './projects'

export interface LabourTask {
  taskId: string
  taskName: string
  status: TaskStatus
  workers: number
  jobName: string
  projectName: string
  deliverables: DeliverableRow[]
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
    .select('project_id, task_id, workers')
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

  const workersByTask = new Map(labour.map((l) => [l.task_id as string, l.workers as number]))
  return ((tasks ?? []) as unknown as TaskJoinRow[]).map((t) => ({
    taskId: t.id,
    taskName: t.name,
    status: t.status,
    workers: workersByTask.get(t.id) ?? 0,
    jobName: t.jobs?.name ?? '',
    projectName: t.jobs?.projects?.name ?? '',
    deliverables: [...t.deliverables].sort((a, b) => a.sort_order - b.sort_order),
  }))
}

export function useLabourToday() {
  const [tasks, setTasks] = useState<LabourTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchLabourToday()
      .then(setTasks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { tasks, loading, error, refetch }
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
