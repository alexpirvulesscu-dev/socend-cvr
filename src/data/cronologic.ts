// Datele pentru „Vedere cronologică": cantitățile raportate pe zile
// (cvr_daily_entries) și oamenii pe zile (view-ul labour_daily, care azi
// citește stub-ul și mâine va citi Pontaj — aceeași funcție, altă sursă).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

/** cantități: deliverable_id → (zi ISO → cantitate) */
export type QtyByDay = Record<string, Record<string, number>>
/** oameni: task_id → (zi ISO → număr de oameni) */
export type WorkersByDay = Record<string, Record<string, number>>

export interface MonthData {
  qty: QtyByDay
  workers: WorkersByDay
  /** oameni-zile pe task, DE LA ÎNCEPUTUL lucrării (nu doar luna afișată) */
  allTimeWorkers: Record<string, number>
}

export async function fetchMonthData(
  deliverableIds: string[],
  taskIds: string[],
  monthStart: string,
  monthEnd: string
): Promise<MonthData> {
  const [entriesRes, labourRes, allLabourRes] = await Promise.all([
    supabase
      .from('cvr_daily_entries')
      .select('deliverable_id, entry_date, qty')
      .in('deliverable_id', deliverableIds)
      .gte('entry_date', monthStart)
      .lte('entry_date', monthEnd),
    supabase
      .from('labour_daily')
      .select('task_id, work_date, workers')
      .in('task_id', taskIds)
      .gte('work_date', monthStart)
      .lte('work_date', monthEnd),
    supabase.from('labour_daily').select('task_id, workers').in('task_id', taskIds),
  ])
  if (entriesRes.error) throw entriesRes.error
  if (labourRes.error) throw labourRes.error
  if (allLabourRes.error) throw allLabourRes.error

  const qty: QtyByDay = {}
  for (const e of entriesRes.data ?? []) {
    const byDay = (qty[e.deliverable_id as string] ??= {})
    // pot exista mai multe raportări în aceeași zi — se adună
    byDay[e.entry_date as string] = (byDay[e.entry_date as string] ?? 0) + Number(e.qty)
  }

  const workers: WorkersByDay = {}
  for (const l of labourRes.data ?? []) {
    const byDay = (workers[l.task_id as string] ??= {})
    byDay[l.work_date as string] = Number(l.workers)
  }

  const allTimeWorkers: Record<string, number> = {}
  for (const l of allLabourRes.data ?? []) {
    allTimeWorkers[l.task_id as string] =
      (allTimeWorkers[l.task_id as string] ?? 0) + Number(l.workers)
  }

  return { qty, workers, allTimeWorkers }
}

/** Oameni-zile consumate pe task, de la începutul lucrării (din labour_daily). */
export function useTaskManDays(taskIds: string[]) {
  const [manDays, setManDays] = useState<Record<string, number>>({})

  useEffect(() => {
    if (taskIds.length === 0) return
    let cancelled = false
    supabase
      .from('labour_daily')
      .select('task_id, workers')
      .in('task_id', taskIds)
      .then(({ data, error }) => {
        if (cancelled || error) return
        const sums: Record<string, number> = {}
        for (const r of data ?? []) {
          sums[r.task_id as string] = (sums[r.task_id as string] ?? 0) + Number(r.workers)
        }
        setManDays(sums)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIds.join(',')])

  return manDays
}

export function useMonthData(
  deliverableIds: string[],
  taskIds: string[],
  monthStart: string,
  monthEnd: string
) {
  const [data, setData] = useState<MonthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchMonthData(deliverableIds, taskIds, monthStart, monthEnd)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // ids-urile vin din același job, deci cheia de lună e suficientă
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd])

  return { data, loading, error }
}
