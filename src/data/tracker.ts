// Citirea și scrierea trackerului de execuție (0027, 0030).
//  · bifele (cvr_tracker_marks): ce porțiune e gata pe ce lucrare și din ce zi
//  · punctele de control (cvr_tracker_checkpoints): „am ajuns cu X la VJ47"
//  · jurnalul zilnic (cvr_tracker_days): un rând pe zi; în `lines` stau locurile zilei,
//    iar `qty` e totalul lor (0031)
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Checkpoint, DayLine, Mark, Segment, Stare, TrackerConfig } from '../domain/tracker'

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

export interface CheckpointRow extends Checkpoint {
  id: string
  created_at: string
}

export interface DayRow {
  id: string
  work_date: string
  qty: Record<string, number>
  /** rândurile zilei, câte unul pe loc (0031); gol la zilele vechi */
  lines: DayLine[]
  note: string | null
}

/** O notă datată pe o porțiune a traseului. */
export interface SegNote {
  id: string
  segment_code: string
  note_date: string
  body: string
}

export interface TrackerData {
  tracker: TrackerRow
  segments: (Segment & { id: string })[]
  points: PointRow[]
  marks: Mark[]
  checkpoints: CheckpointRow[]
  days: DayRow[]
  notes: SegNote[]
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

const DAY_COLS = 'id, work_date, qty, lines, note'
const CP_COLS = 'id, stage, from_pt, at_pt, done_on, created_at'

async function fetchTracker(id: string): Promise<TrackerData> {
  const [t, s, p, m, c, d, n] = await Promise.all([
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
    supabase.from('cvr_tracker_marks').select('segment_code, stage, done_on').eq('tracker_id', id).limit(10000),
    supabase.from('cvr_tracker_checkpoints').select(CP_COLS).eq('tracker_id', id).order('created_at'),
    supabase.from('cvr_tracker_days').select(DAY_COLS).eq('tracker_id', id).order('work_date', { ascending: false }),
    supabase.from('cvr_tracker_segment_notes').select('id, segment_code, note_date, body').eq('tracker_id', id).limit(10000),
  ])
  for (const r of [t, s, p, m, c, d, n]) if (r.error) throw r.error
  return {
    tracker: t.data as TrackerRow,
    segments: ((s.data ?? []) as (Segment & { id: string })[]).map((x) => ({ ...x, length_m: Number(x.length_m) })),
    points: (p.data ?? []) as PointRow[],
    marks: (m.data ?? []) as Mark[],
    checkpoints: (c.data ?? []) as CheckpointRow[],
    days: (d.data ?? []) as DayRow[],
    notes: (n.data ?? []) as SegNote[],
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
      // erorile Supabase nu sunt Error, dar au `message`
      setError(e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e)))
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  return { data, error, reload, setData }
}

// ── Bife și puncte de control ────────────────────────────────────────────

/** Punct de control: salvează „am ajuns la", apoi bifează porțiunile lui. */
export async function saveCheckpoint(
  trackerId: string,
  cp: { stage: string; from_pt: string; at_pt: string; done_on: string },
  segmentCodes: string[]
): Promise<{ checkpoint: CheckpointRow; marks: Mark[] }> {
  const marks = segmentCodes.map((code) => ({ segment_code: code, stage: cp.stage, done_on: cp.done_on }))
  if (marks.length) {
    const { error } = await supabase
      .from('cvr_tracker_marks')
      .upsert(marks.map((m) => ({ ...m, tracker_id: trackerId })), {
        onConflict: 'tracker_id,segment_code,stage',
        ignoreDuplicates: true,
      })
    if (error) throw error
  }
  const { data, error } = await supabase
    .from('cvr_tracker_checkpoints')
    .insert({ ...cp, tracker_id: trackerId })
    .select(CP_COLS)
    .single()
  if (error) throw error
  return { checkpoint: data as CheckpointRow, marks }
}

/** Bifează sau debifează o porțiune pe o lucrare (corecturi de pe hartă). */
export async function setMark(trackerId: string, m: Mark, on: boolean): Promise<void> {
  const q = on
    ? supabase.from('cvr_tracker_marks').upsert({ ...m, tracker_id: trackerId }, { onConflict: 'tracker_id,segment_code,stage' })
    : supabase
        .from('cvr_tracker_marks')
        .delete()
        .eq('tracker_id', trackerId)
        .eq('segment_code', m.segment_code)
        .eq('stage', m.stage)
  const { error } = await q
  if (error) throw error
}

// ── Jurnalul zilnic ──────────────────────────────────────────────────────

export async function saveDay(
  trackerId: string,
  day: { work_date: string; qty: Record<string, number>; lines: DayLine[]; note: string | null }
): Promise<DayRow> {
  const { data, error } = await supabase
    .from('cvr_tracker_days')
    .upsert({ ...day, tracker_id: trackerId }, { onConflict: 'tracker_id,work_date' })
    .select(DAY_COLS)
    .single()
  if (error) throw error
  return data as DayRow
}

export async function deleteDay(id: string): Promise<void> {
  const { error } = await supabase.from('cvr_tracker_days').delete().eq('id', id)
  if (error) throw error
}

// ── Notele porțiunilor (0033) ────────────────────────────────────────────

const NOTE_COLS = 'id, segment_code, note_date, body'

export async function addSegNote(
  trackerId: string,
  n: { segment_code: string; note_date: string; body: string }
): Promise<SegNote> {
  const { data, error } = await supabase
    .from('cvr_tracker_segment_notes')
    .insert({ ...n, tracker_id: trackerId })
    .select(NOTE_COLS)
    .single()
  if (error) throw error
  return data as SegNote
}

export async function updateSegNote(id: string, patch: { note_date: string; body: string }): Promise<SegNote> {
  const { data, error } = await supabase
    .from('cvr_tracker_segment_notes')
    .update(patch)
    .eq('id', id)
    .select(NOTE_COLS)
    .single()
  if (error) throw error
  return data as SegNote
}

export async function deleteSegNote(id: string): Promise<void> {
  const { error } = await supabase.from('cvr_tracker_segment_notes').delete().eq('id', id)
  if (error) throw error
}

// ── Lucrări separate ─────────────────────────────────────────────────────

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
