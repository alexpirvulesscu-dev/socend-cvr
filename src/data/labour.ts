// Orele de manoperă: planul și consumul real din Pontaj.
//
// Regula, pe scurt (0023): orele se numără la nivelul la care au fost
// repartizate, dar se adună mereu în sus. Dacă echipa e pusă doar pe proiect,
// orele stau pe proiect — și tot se văd. Dacă e pusă pe un job, jobul adună
// orele lui plus ale taskurilor lui. Totalul proiectului e tot ce s-a pontat pe
// el, oricât de adânc a fost repartizat. Nimic din asta nu depinde de livrabile
// sau de progres.
//
// Agregarea se face ÎN BAZĂ, prin vederile `cvr_labour_by_*`. Versiunea veche
// citea toate pontajele din browser și primea doar primele 1.000 (limita
// PostgREST), deci totalurile erau o felie arbitrară din realitate.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { plannedHours } from '../domain/labour'

/** Orele consumate pe un proiect, defalcate după nivelul repartiției. */
export interface ProjectHours {
  /** tot ce s-a pontat pe proiect, la orice nivel */
  total: number
  /** din care: repartizate până la task */
  peTask: number
  /** din care: repartizate pe job, dar nu pe task */
  peJob: number
  /** din care: rămase la nivel de proiect */
  peProiect: number
  firstDay: string | null
  lastDay: string | null
}

export interface LabourHours {
  byProject: Record<string, ProjectHours>
  /** ore pe job = orele jobului + ale taskurilor lui */
  byJob: Record<string, number>
  byTask: Record<string, number>
}

export const EMPTY_HOURS: LabourHours = { byProject: {}, byJob: {}, byTask: {} }

const ZERO: ProjectHours = {
  total: 0,
  peTask: 0,
  peJob: 0,
  peProiect: 0,
  firstDay: null,
  lastDay: null,
}

/** Orele unui proiect, cu zero-uri când nu s-a pontat nimic încă. */
export function hoursOf(h: LabourHours, projectId: string): ProjectHours {
  return h.byProject[projectId] ?? ZERO
}

/** Orele consumate, pe toate proiectele. Se recitesc la fiecare montare. */
export function useLabourHours(): {
  hours: LabourHours
  loading: boolean
  refetch: () => void
} {
  const [hours, setHours] = useState<LabourHours>(EMPTY_HOURS)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const refetch = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    let alive = true
    async function load() {
      const [proj, job, task] = await Promise.all([
        supabase
          .from('cvr_labour_by_project')
          .select('project_id, hours, hours_task, hours_job, hours_project, first_day, last_day'),
        supabase.from('cvr_labour_by_job').select('job_id, hours'),
        supabase.from('cvr_labour_by_task').select('task_id, hours'),
      ])

      const out: LabourHours = { byProject: {}, byJob: {}, byTask: {} }
      for (const r of proj.data ?? []) {
        out.byProject[r.project_id as string] = {
          total: Number(r.hours) || 0,
          peTask: Number(r.hours_task) || 0,
          peJob: Number(r.hours_job) || 0,
          peProiect: Number(r.hours_project) || 0,
          firstDay: (r.first_day as string) ?? null,
          lastDay: (r.last_day as string) ?? null,
        }
      }
      for (const r of job.data ?? []) out.byJob[r.job_id as string] = Number(r.hours) || 0
      for (const r of task.data ?? []) out.byTask[r.task_id as string] = Number(r.hours) || 0

      if (alive) {
        setHours(out)
        setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [tick])

  return { hours, loading, refetch }
}

/** O zi de pontaj pe un proiect. */
export interface LabourDay {
  work_date: string
  hours: number
}

/** Orele zi cu zi ale unui proiect, pentru comparația plan vs consumat. */
export function useLabourDays(projectId: string | null): {
  days: LabourDay[]
  loading: boolean
} {
  const [days, setDays] = useState<LabourDay[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!projectId) {
      setDays([])
      setLoading(false)
      return
    }
    setLoading(true)
    void (async () => {
      const { data } = await supabase
        .from('cvr_labour_by_day')
        .select('work_date, hours')
        .eq('project_id', projectId)
        .order('work_date')
      if (!alive) return
      setDays(
        (data ?? []).map((r) => ({
          work_date: r.work_date as string,
          hours: Number(r.hours) || 0,
        }))
      )
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [projectId])

  return { days, loading }
}

/** Tariful la care s-a vândut manopera, când planul se deduce din lei. */
export const TARIF_ORA = 75

/** Oameni-zile → ore (o zi de om = 8 ore). Taskurile stochează oameni-zile. */
export function manDaysToHours(manDays: number | null | undefined): number {
  return (Number(manDays) || 0) * 8
}

// ── Planul de ore, într-un singur loc ────────────────────────────────────
// Regula (0023): numărul declarat pe nivel bate suma nivelului de dedesubt.

/** Planul de ore al unui task: din oamenii-zile plănuiți. */
export function planOfTask(task: { planned_man_days: number | null }): number {
  return manDaysToHours(task.planned_man_days)
}

/** Planul unui job: numărul lui, altfel suma orelor taskurilor. */
export function planOfJob(job: {
  planned_hours: number | null
  tasks: { planned_man_days: number | null }[]
}): number {
  return plannedHours({
    declared: job.planned_hours === null ? null : Number(job.planned_hours),
    children: job.tasks.map(planOfTask),
  })
}

/** Planul unui proiect: numărul lui, altfel suma joburilor. */
export function planOfProject(p: {
  planned_hours: number | null
  jobs: { planned_hours: number | null; tasks: { planned_man_days: number | null }[] }[]
}): number {
  return plannedHours({
    declared: p.planned_hours === null ? null : Number(p.planned_hours),
    children: p.jobs.map(planOfJob),
  })
}
