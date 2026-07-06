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
       deliverables ( id, name, um, qty_total, qty_done, weight, sort_order ),
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
