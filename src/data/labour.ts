// Orele lucrate, citite din Pontaj.
//
// Pontajul înregistrează ore REALE (regular + overtime), pe om și pe zi, dar
// legate de PROIECT — nu are încă job_id / task_id. Până când Pontajul coboară
// repartiția la job și task, CVR compară orele doar la nivel de proiect; joburile
// și taskurile își arată doar orele PLANIFICATE.
//
// Când Pontajul va scrie job_id/task_id, singurul lucru de schimbat aici e
// selectul: restul aplicației citește deja prin funcțiile de mai jos.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface LabourHours {
  /** ore consumate pe proiect */
  byProject: Record<string, number>
  /** ore consumate pe job (gol cât timp Pontajul nu alocă pe job) */
  byJob: Record<string, number>
  /** ore consumate pe task (gol cât timp Pontajul nu alocă pe task) */
  byTask: Record<string, number>
}

const EMPTY: LabourHours = { byProject: {}, byJob: {}, byTask: {} }

interface Row {
  project_id: string
  job_id: string | null
  task_id: string | null
  regular_hours: number | null
  overtime_hours: number | null
}

/** Orele consumate, pe toate proiectele. Se citește o dată, la montare. */
export function useLabourHours(): { hours: LabourHours; loading: boolean } {
  const [hours, setHours] = useState<LabourHours>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    async function load() {
      // job_id/task_id pot lipsi din tabel (Pontajul nu le-a adăugat încă) —
      // de aceea le cerem separat și cădem elegant dacă selectul eșuează
      let rows: Row[] = []
      const full = await supabase
        .from('pontaj_timesheets')
        .select('project_id, job_id, task_id, regular_hours, overtime_hours')
        .is('deleted_at', null)
      if (full.error) {
        const basic = await supabase
          .from('pontaj_timesheets')
          .select('project_id, regular_hours, overtime_hours')
          .is('deleted_at', null)
        rows = ((basic.data ?? []) as Omit<Row, 'job_id' | 'task_id'>[]).map((r) => ({
          ...r,
          job_id: null,
          task_id: null,
        }))
      } else {
        rows = (full.data ?? []) as Row[]
      }

      const out: LabourHours = { byProject: {}, byJob: {}, byTask: {} }
      for (const r of rows) {
        const h = Number(r.regular_hours ?? 0) + Number(r.overtime_hours ?? 0)
        if (!h) continue
        out.byProject[r.project_id] = (out.byProject[r.project_id] ?? 0) + h
        if (r.job_id) out.byJob[r.job_id] = (out.byJob[r.job_id] ?? 0) + h
        if (r.task_id) out.byTask[r.task_id] = (out.byTask[r.task_id] ?? 0) + h
      }
      if (alive) {
        setHours(out)
        setLoading(false)
      }
    }
    void load()
    return () => {
      alive = false
    }
  }, [])

  return { hours, loading }
}

/** Tariful la care s-a vândut manopera. Orele planificate = valoare manoperă / tarif. */
export const TARIF_ORA = 75

/** Oameni-zile → ore (o zi de om = 8 ore). Planul e stocat în oameni-zile. */
export function manDaysToHours(manDays: number | null | undefined): number {
  return (Number(manDays) || 0) * 8
}
