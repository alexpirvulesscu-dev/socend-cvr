// Trackerul de execuție pe traseu (primul: Peștișani VJ36-VJ80).
// Se măsoară DOAR ce e terminat, prin puncte de control:
// „cu săpătura am ajuns la VJ47". Porțiunile dintre punctul de unde s-a pornit
// și VJ47 se bifează pentru săpătură, iar ziua bifei rămâne pe fiecare porțiune.
// Cantitățile zilnice (jurnalul) sunt separate și nu schimbă harta.

export type Stare = 'ns' | 'ip' | 'done'

export const STARE_LABEL: Record<Stare, string> = {
  ns: 'Neînceput',
  ip: 'În lucru',
  done: 'Finalizat',
}

export interface TrackerType {
  id: string
  label: string
  short: string
  color: string
}

export interface TrackerStage {
  id: string
  label: string
  unit?: string
  group?: string
}

export interface DailyColumn {
  id: string
  label: string
  unit: string
  group?: string
}

export interface TrackerConfig {
  unit?: string
  types: TrackerType[]
  groups?: { id: string; label: string }[]
  /** lucrările măsurate cu puncte de control (au lungime pe traseu) */
  stages: TrackerStage[]
  stagesByType: Record<string, string[]>
  /** coloanele jurnalului zilnic */
  dailyColumns?: DailyColumn[]
}

export interface Segment {
  id?: string
  code: string
  from_pt: string
  to_pt: string
  part: number
  parts: number
  length_m: number
  kind: string
  sort_order: number
  note?: string | null
}

export interface Mark {
  segment_code: string
  stage: string
  done_on: string
}

export interface Checkpoint {
  stage: string
  from_pt: string
  at_pt: string
  done_on: string
  created_at?: string
}

/** porțiune → lucrare → ziua în care a fost bifată gata */
export type Marks = Map<string, Map<string, string>>

/** Reperele traseului, în ordine (VJ36, VJ37, … VJ80). */
export function boundaries(segments: Segment[]): string[] {
  const sorted = [...segments].sort((a, b) => a.sort_order - b.sort_order)
  // o porțiune împărțită în două (VJ38-VJ39 a și b) are aceleași repere de două ori
  const out = new Set<string>()
  for (const s of sorted) {
    out.add(s.from_pt)
    out.add(s.to_pt)
  }
  return [...out]
}

export function stagesFor(cfg: TrackerConfig, kind: string): string[] {
  return cfg.stagesByType[kind] ?? []
}

/** Porțiunile dintre două repere, în sensul de mers al frontului. */
export function segmentsInRange(segments: Segment[], from: string | null, to: string | null): Segment[] {
  if (!from || !to) return []
  const pts = boundaries(segments)
  const i = pts.indexOf(from)
  const j = pts.indexOf(to)
  if (i < 0 || j < 0 || i === j) return []
  const lo = Math.min(i, j)
  const hi = Math.max(i, j)
  const inside = [...segments]
    .filter((s) => pts.indexOf(s.from_pt) >= lo && pts.indexOf(s.to_pt) <= hi)
    .sort((a, b) => a.sort_order - b.sort_order)
  return i < j ? inside : inside.reverse()
}

export function markMap(marks: Mark[]): Marks {
  const m: Marks = new Map()
  for (const x of marks) {
    const inner = m.get(x.segment_code) ?? new Map<string, string>()
    inner.set(x.stage, x.done_on)
    m.set(x.segment_code, inner)
  }
  return m
}

export function isDone(mm: Marks, seg: string, stage: string): boolean {
  return mm.get(seg)?.has(stage) ?? false
}

/** Starea porțiunii: gata dacă toate lucrările ei sunt bifate, în lucru dacă e bifată vreuna. */
export function segmentState(cfg: TrackerConfig, seg: Segment, mm: Marks): Stare {
  const list = stagesFor(cfg, seg.kind)
  const n = list.filter((k) => isDone(mm, seg.code, k)).length
  if (list.length > 0 && n === list.length) return 'done'
  if (n > 0) return 'ip'
  return 'ns'
}

export interface Summary {
  total: number
  byState: Record<Stare, number>
  byType: Record<string, number>
}

export function summarize(cfg: TrackerConfig, segments: Segment[], mm: Marks): Summary {
  const byState: Record<Stare, number> = { ns: 0, ip: 0, done: 0 }
  const byType: Record<string, number> = {}
  let total = 0
  for (const s of segments) {
    const len = Number(s.length_m)
    total += len
    byState[segmentState(cfg, s, mm)] += len
    byType[s.kind] = (byType[s.kind] ?? 0) + len
  }
  return { total, byState, byType }
}

export interface WorkProgress {
  stage: TrackerStage
  /** metri de executat: porțiunile care au lucrarea */
  total: number
  /** metri bifați gata */
  done: number
  /** ultimul punct de control */
  front: Checkpoint | null
  /** ultima zi în care s-a bifat ceva pe lucrarea asta */
  lastDay: string | null
}

export function workProgress(
  cfg: TrackerConfig,
  segments: Segment[],
  mm: Marks,
  checkpoints: Checkpoint[]
): WorkProgress[] {
  return cfg.stages.map((st) => {
    let total = 0
    let done = 0
    let lastDay: string | null = null
    for (const s of segments) {
      if (!stagesFor(cfg, s.kind).includes(st.id)) continue
      total += Number(s.length_m)
      const d = mm.get(s.code)?.get(st.id)
      if (d) {
        done += Number(s.length_m)
        if (!lastDay || d > lastDay) lastDay = d
      }
    }
    const front = lastCheckpoint(checkpoints, st.id)
    return { stage: st, total, done, front, lastDay }
  })
}

export function lastCheckpoint(checkpoints: Checkpoint[], stage: string): Checkpoint | null {
  const list = checkpoints.filter((c) => c.stage === stage)
  if (!list.length) return null
  return list.reduce((a, b) =>
    (b.done_on > a.done_on || (b.done_on === a.done_on && (b.created_at ?? '') >= (a.created_at ?? ''))) ? b : a
  )
}

/** De unde pornește frontul: ultimul punct de control, altfel capătul VJ80 (se lucrează înapoi). */
export function defaultFrom(segments: Segment[], checkpoints: Checkpoint[], stage: string): string {
  const pts = boundaries(segments)
  return lastCheckpoint(checkpoints, stage)?.at_pt ?? pts[pts.length - 1] ?? ''
}

/** Porțiunile care se bifează când frontul ajunge de la `from` la `to` (doar cele încă nebifate). */
export function checkpointPlan(
  cfg: TrackerConfig,
  segments: Segment[],
  mm: Marks,
  stage: string,
  from: string,
  to: string
): Segment[] {
  return segmentsInRange(segments, from, to).filter(
    (s) => stagesFor(cfg, s.kind).includes(stage) && !isDone(mm, s.code, stage)
  )
}

/** Totalul fiecărei coloane din jurnalul zilnic. */
export function dayTotals(days: { qty: Record<string, number> }[], cols: DailyColumn[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of cols) out[c.id] = 0
  for (const d of days) for (const c of cols) out[c.id] += Number(d.qty[c.id] ?? 0)
  return out
}

/** Numele scurt al unei porțiuni: „VJ38-VJ39" sau „VJ38-VJ39 (1/2)". */
export function segmentLabel(s: Segment): string {
  const base = `${s.from_pt}-${s.to_pt}`
  return s.parts > 1 ? `${base} (${s.part + 1}/${s.parts})` : base
}

// ── Jurnalul zilnic: locul lucrărilor ────────────────────────────────────
// Jurnalul are un rând pe zi. Locul nu se scrie de mână: vine din bifele de pe
// traseu (ziua în care o porțiune a fost bifată gata) și din lucrările
// adiționale adăugate pe o porțiune.

/** O lucrare adițională adăugată de pe o porțiune a traseului. */
export interface DayLine {
  id: string
  from_pt: string | null
  to_pt: string | null
  qty: Record<string, number>
  note: string | null
}

/** „VJ65-VJ72" pentru un șir de porțiuni lipite una de alta. */
function runs(list: Segment[]): string[] {
  const sorted = [...list].sort((a, b) => a.sort_order - b.sort_order)
  const out: { from: string; to: string }[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && (last.to === s.from_pt || last.to === s.to_pt)) last.to = s.to_pt
    else out.push({ from: s.from_pt, to: s.to_pt })
  }
  return out.map((r) => `${r.from}-${r.to}`)
}

/**
 * Unde s-a lucrat într-o zi, câte un rând pe lucrare:
 *  · lucrările de pe traseu: porțiunile bifate gata în ziua aceea, dacă jurnalul
 *    are cantitate pe lucrarea respectivă în aceeași zi
 *  · lucrările adiționale: porțiunea de pe care au fost adăugate
 */
export function dayPlaces(
  cfg: TrackerConfig,
  segments: Segment[],
  marks: Mark[],
  day: { work_date: string; qty: Record<string, number>; lines?: DayLine[] | null }
): { label: string; where: string }[] {
  const out: { label: string; where: string }[] = []
  const cols = cfg.dailyColumns ?? []
  const byCode = new Map(segments.map((s) => [s.code, s]))
  for (const st of cfg.stages) {
    // coloana lucrării: același nume, sau împărțită pe echipe (sudura → sudura_e1, sudura_e2)
    const has = cols.some((c) => (c.id === st.id || c.id.startsWith(st.id + '_')) && Number(day.qty[c.id] ?? 0) > 0)
    if (!has) continue
    const segs = marks
      .filter((m) => m.stage === st.id && m.done_on === day.work_date)
      .map((m) => byCode.get(m.segment_code))
      .filter((s): s is Segment => !!s)
    if (segs.length) out.push({ label: st.label, where: runs(segs).join(', ') })
  }
  for (const c of cols) {
    const places = (day.lines ?? []).filter((l) => Number(l.qty[c.id] ?? 0) > 0 && l.from_pt && l.to_pt)
    if (places.length) out.push({ label: c.label, where: [...new Set(places.map((l) => `${l.from_pt}-${l.to_pt}`))].join(', ') })
  }
  return out
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lunea săptămânii în care cade ziua. */
export function weekStart(iso: string): string {
  const dow = new Date(iso + 'T00:00:00Z').getUTCDay()
  return addDays(iso, -((dow + 6) % 7))
}

export interface Week<T> {
  start: string
  end: string
  days: T[]
}

/** Zilele grupate pe săptămâni (luni-duminică), cele mai noi primele. */
export function groupWeeks<T extends { work_date: string }>(days: T[]): Week<T>[] {
  const map = new Map<string, T[]>()
  for (const d of days) {
    const k = weekStart(d.work_date)
    map.set(k, [...(map.get(k) ?? []), d])
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([start, list]) => ({
      start,
      end: addDays(start, 6),
      days: list.sort((a, b) => (a.work_date < b.work_date ? 1 : -1)),
    }))
}
