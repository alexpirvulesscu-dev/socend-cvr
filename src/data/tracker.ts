// Citirea și scrierea trackerului de execuție (tabelele cvr_tracker_*, 0027).
// Starea de azi NU se scrie nicăieri: se calculează din jurnal (domain/tracker).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Entry, Segment, Stare, TrackerConfig } from '../domain/tracker'

export interface TrackerRow {
  id: string
  project_id: string
  job_id: string | null
  name: string
  subtitle: string | null
  config: TrackerConfig
}

export interface PointRow {
  id: string
  code: string
  name: string
  location: string | null
  at_pt: string | null
  status: Stare
  note: string | null
  sort_order: number
  updated_at: string
}

export interface EntryRow extends Entry {
  id: string
  note: string | null
  created_at: string
}

export interface TrackerData {
  tracker: TrackerRow
  segments: (Segment & { id: string })[]
  points: PointRow[]
  entries: EntryRow[]
}

/** Lista scurtă a trackerelor (fără date), ca pagina proiectului să știe dacă are tab. */
export function useTrackerList() {
  const [list, setList] = useState<{ id: string; project_id: string; job_id: string | null }[]>([])
  useEffect(() => {
    let live = true
    void supabase
      .from('cvr_trackers')
      .select('id, project_id, job_id')
      .then(({ data }) => {
        if (live && data) setList(data)
      })
    return () => {
      live = false
    }
  }, [])
  return list
}

async function fetchTracker(id: string): Promise<TrackerData> {
  const [t, s, p, e] = await Promise.all([
    supabase.from('cvr_trackers').select('id, project_id, job_id, name, subtitle, config').eq('id', id).single(),
    supabase
      .from('cvr_tracker_segments')
      .select('id, code, from_pt, to_pt, part, parts, length_m, kind, note, sort_order')
      .eq('tracker_id', id)
      .order('sort_order'),
    supabase
      .from('cvr_tracker_points')
      .select('id, code, name, location, at_pt, status, note, sort_order, updated_at')
      .eq('tracker_id', id)
      .order('sort_order'),
    supabase
      .from('cvr_tracker_entries')
      .select('id, work_date, stage, from_pt, to_pt, qty, note, created_at')
      .eq('tracker_id', id)
      .order('work_date')
      .order('created_at')
      .limit(10000),
  ])
  for (const r of [t, s, p, e]) if (r.error) throw r.error
  return {
    tracker: t.data as TrackerRow,
    segments: ((s.data ?? []) as (Segment & { id: string })[]).map((x) => ({ ...x, length_m: Number(x.length_m) })),
    points: (p.data ?? []) as PointRow[],
    entries: ((e.data ?? []) as EntryRow[]).map((x) => ({ ...x, qty: Number(x.qty) })),
  }
}

export function useTracker(id: string) {
  const [data, setData] = useState<TrackerData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setData(await fetchTracker(id))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, reload, setData }
}

export interface NewEntry {
  work_date: string
  stage: string
  from_pt: string
  to_pt: string
  qty: number
  note: string | null
}

export async function addEntries(trackerId: string, rows: NewEntry[]): Promise<EntryRow[]> {
  const { data, error } = await supabase
    .from('cvr_tracker_entries')
    .insert(rows.map((r) => ({ ...r, tracker_id: trackerId })))
    .select('id, work_date, stage, from_pt, to_pt, qty, note, created_at')
  if (error) throw error
  return ((data ?? []) as EntryRow[]).map((x) => ({ ...x, qty: Number(x.qty) }))
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('cvr_tracker_entries').delete().eq('id', id)
  if (error) throw error
}

export async function updatePoint(id: string, patch: { status: Stare; note: string | null }): Promise<PointRow> {
  const { data, error } = await supabase
    .from('cvr_tracker_points')
    .update(patch)
    .eq('id', id)
    .select('id, code, name, location, at_pt, status, note, sort_order, updated_at')
    .single()
  if (error) throw error
  return data as PointRow
}

/** Ziua de azi în România, „yyyy-mm-dd". */
export function azi(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })
}
