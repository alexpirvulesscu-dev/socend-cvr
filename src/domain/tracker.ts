// Trackerul de execuție pe traseu (primul: Peștișani VJ36-VJ80).
// O singură sursă: jurnalul zilnic. Un rând = o zi, o etapă, de la un reper la
// altul, câți metri. Starea de azi a fiecărei porțiuni se calculează din jurnal.
//
// Cum se împart metrii unui rând pe porțiuni: frontul de lucru pornește de la
// reperul „de la" și înaintează spre „până la". Fiecare porțiune se umple până
// la lungimea ei, apoi se trece la următoarea. Ce nu încape rămâne „neatribuit".
// Rândurile se iau în ordinea zilelor, deci a doua zi continuă de unde s-a rămas.

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
  /** „ml" se pune pe porțiuni (hartă); „buc" se numără doar pe zile */
  unit?: string
  group?: string
  /** de executat, pentru lucrările în bucăți */
  target?: number
}

export interface TrackerConfig {
  unit?: string
  types: TrackerType[]
  groups?: { id: string; label: string }[]
  stages: TrackerStage[]
  stagesByType: Record<string, string[]>
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

export interface Entry {
  id?: string
  work_date: string
  /** gol = rând doar cu observații */
  stage: string | null
  /** gol = fără reper (ex. Mihai nu știe VJ-ul) sau o lucrare separată */
  from_pt: string | null
  to_pt: string | null
  qty: number | null
  note?: string | null
  created_at?: string
  batch_id?: string | null
  /** „realizat înainte de jurnal" — intră în total, nu într-o zi */
  is_initial?: boolean
}

export interface Alloc {
  entryIndex: number
  segCode: string
  qty: number
}

export interface Allocation {
  allocs: Alloc[]
  /** metri care nu au încăput în porțiunile din interval, pe indexul rândului */
  unplaced: Map<number, number>
  /** metri realizați, pe porțiune și etapă */
  filled: Map<string, Map<string, number>>
}

const EPS = 0.05

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

/** Lucrarea se pune pe porțiunile hărții (are lungime). */
export function isSpatial(cfg: TrackerConfig, stage: string | null): boolean {
  return !!stage && Object.values(cfg.stagesByType).some((l) => l.includes(stage))
}

/** Ordinea în care se iau rândurile: pe zile, apoi cum au fost introduse. */
function entryOrder(entries: Entry[]): number[] {
  return entries
    .map((_, i) => i)
    .sort((a, b) => {
      const ea = entries[a]
      const eb = entries[b]
      if (ea.work_date !== eb.work_date) return ea.work_date < eb.work_date ? -1 : 1
      const ca = ea.created_at ?? ''
      const cb = eb.created_at ?? ''
      if (ca !== cb) return ca < cb ? -1 : 1
      return a - b
    })
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

export function allocate(cfg: TrackerConfig, segments: Segment[], entries: Entry[]): Allocation {
  const filled = new Map<string, Map<string, number>>()
  for (const s of segments) filled.set(s.code, new Map())
  const allocs: Alloc[] = []
  const unplaced = new Map<number, number>()

  for (const idx of entryOrder(entries)) {
    const e = entries[idx]
    // doar lucrările cu lungime, cu ambele repere, se pun pe hartă
    if (!e.stage || !e.qty || !e.from_pt || !e.to_pt || !isSpatial(cfg, e.stage)) continue
    const stage = e.stage
    let left = Number(e.qty)
    const range = segmentsInRange(segments, e.from_pt, e.to_pt).filter((s) =>
      stagesFor(cfg, s.kind).includes(stage)
    )
    for (const s of range) {
      if (left <= 0) break
      const m = filled.get(s.code)!
      const have = m.get(stage) ?? 0
      const room = Number(s.length_m) - have
      if (room <= EPS) continue
      const take = Math.min(room, left)
      m.set(stage, have + take)
      allocs.push({ entryIndex: idx, segCode: s.code, qty: take })
      left -= take
    }
    if (left > EPS) unplaced.set(idx, left)
  }
  return { allocs, unplaced, filled }
}

export function stageState(seg: Segment, metri: number): Stare {
  if (metri >= Number(seg.length_m) - EPS) return 'done'
  if (metri > EPS) return 'ip'
  return 'ns'
}

/** Starea porțiunii: gata dacă toate etapele ei sunt gata, în lucru dacă a pornit vreuna. */
export function segmentState(cfg: TrackerConfig, seg: Segment, a: Allocation): Stare {
  const m = a.filled.get(seg.code)
  const st = stagesFor(cfg, seg.kind).map((k) => stageState(seg, m?.get(k) ?? 0))
  if (st.length > 0 && st.every((x) => x === 'done')) return 'done'
  if (st.some((x) => x !== 'ns')) return 'ip'
  return 'ns'
}

export interface Summary {
  total: number
  byState: Record<Stare, number>
  byType: Record<string, number>
  /** pe etapă: metri de executat (doar porțiunile care o au) și metri realizați */
  byStage: { id: string; label: string; total: number; done: number }[]
}

export function summarize(cfg: TrackerConfig, segments: Segment[], a: Allocation): Summary {
  const byState: Record<Stare, number> = { ns: 0, ip: 0, done: 0 }
  const byType: Record<string, number> = {}
  const agg = new Map<string, { total: number; done: number }>()
  let total = 0
  for (const s of segments) {
    const len = Number(s.length_m)
    total += len
    byState[segmentState(cfg, s, a)] += len
    byType[s.kind] = (byType[s.kind] ?? 0) + len
    for (const k of stagesFor(cfg, s.kind)) {
      const g = agg.get(k) ?? { total: 0, done: 0 }
      g.total += len
      g.done += a.filled.get(s.code)?.get(k) ?? 0
      agg.set(k, g)
    }
  }
  const byStage = cfg.stages
    .filter((st) => agg.has(st.id))
    .map((st) => ({ id: st.id, label: st.label, ...agg.get(st.id)! }))
  return { total, byState, byType, byStage }
}

/** Ce s-a lucrat pe o porțiune, zi cu zi (cea mai nouă zi prima). */
export function segmentHistory(
  entries: Entry[],
  a: Allocation,
  segCode: string
): { date: string; stage: string; qty: number }[] {
  return a.allocs
    .filter((x) => x.segCode === segCode)
    .map((x) => ({ date: entries[x.entryIndex].work_date, stage: entries[x.entryIndex].stage ?? '', qty: x.qty }))
    .sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0))
}

/** Porțiunile atinse într-o zi și cu ce etape. */
export function dayTouches(entries: Entry[], a: Allocation, date: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const x of a.allocs) {
    const e = entries[x.entryIndex]
    if (e.work_date !== date || !e.stage) continue
    const list = out.get(x.segCode) ?? []
    if (!list.includes(e.stage)) list.push(e.stage)
    out.set(x.segCode, list)
  }
  return out
}

/** Numele scurt al unei porțiuni: „VJ38-VJ39" sau „VJ38-VJ39 (1/2)". */
export function segmentLabel(s: Segment): string {
  const base = `${s.from_pt}-${s.to_pt}`
  return s.parts > 1 ? `${base} (${s.part + 1}/${s.parts})` : base
}

// ── Pe zile (foaia „Tracker" din Excel) ─────────────────────────────────

export interface GridRow {
  stage: TrackerStage
  /** de executat: lungimea porțiunilor care au lucrarea, sau ținta în bucăți */
  total: number | null
  /** realizat înainte de jurnal */
  initial: number
  done: number
  pct: number | null
  left: number | null
  /** media pe zilele în care s-a lucrat la ea (fără „înainte de jurnal") */
  perDayAvg: number | null
  daysWorked: number
  perDay: Map<string, number>
}

/** Toate zilele din calendar, de la `from` la `to` inclusiv. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = []
  const d = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  while (d <= end && out.length < 1000) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

export function workGrid(
  cfg: TrackerConfig,
  segments: Segment[],
  entries: Entry[],
  today: string
): { days: string[]; rows: GridRow[] } {
  const dated = entries.filter((e) => !e.is_initial)
  const first = dated.reduce<string | null>((m, e) => (m === null || e.work_date < m ? e.work_date : m), null)
  const last = dated.reduce((m, e) => (e.work_date > m ? e.work_date : m), today)
  const days = first ? dayRange(first, last > today ? last : today) : []

  const rows = cfg.stages.map((st) => {
    const spatial = isSpatial(cfg, st.id)
    const total = spatial
      ? segments.filter((s) => stagesFor(cfg, s.kind).includes(st.id)).reduce((a, s) => a + Number(s.length_m), 0)
      : (st.target ?? null)
    let initial = 0
    const perDay = new Map<string, number>()
    for (const e of entries) {
      if (e.stage !== st.id || !e.qty) continue
      if (e.is_initial) initial += Number(e.qty)
      else perDay.set(e.work_date, (perDay.get(e.work_date) ?? 0) + Number(e.qty))
    }
    const logged = [...perDay.values()].reduce((a, b) => a + b, 0)
    const done = initial + logged
    return {
      stage: st,
      total,
      initial,
      done,
      pct: total ? done / total : null,
      left: total !== null ? total - done : null,
      perDayAvg: perDay.size > 0 ? logged / perDay.size : null,
      daysWorked: perDay.size,
      perDay,
    }
  })
  return { days, rows }
}

// ── Pe porțiuni (foaia „Pe secțiuni" din Excel) ─────────────────────────

export interface SectionRow {
  from: string
  to: string
  parts: Segment[]
  length: number
  /** pe lucrare: metri de executat pe porțiune și metri realizați */
  byStage: Map<string, { total: number; done: number }>
  daysWorked: number
  lastDay: string | null
}

export function sectionTable(
  cfg: TrackerConfig,
  segments: Segment[],
  entries: Entry[],
  a: Allocation
): SectionRow[] {
  const out: SectionRow[] = []
  for (const s of [...segments].sort((x, y) => x.sort_order - y.sort_order)) {
    let row = out[out.length - 1]
    if (!row || row.from !== s.from_pt) {
      row = { from: s.from_pt, to: s.to_pt, parts: [], length: 0, byStage: new Map(), daysWorked: 0, lastDay: null }
      out.push(row)
    }
    row.parts.push(s)
    row.length += Number(s.length_m)
    for (const k of stagesFor(cfg, s.kind)) {
      const g = row.byStage.get(k) ?? { total: 0, done: 0 }
      g.total += Number(s.length_m)
      g.done += a.filled.get(s.code)?.get(k) ?? 0
      row.byStage.set(k, g)
    }
  }
  for (const row of out) {
    const codes = new Set(row.parts.map((p) => p.code))
    const dates = new Set(
      a.allocs.filter((x) => codes.has(x.segCode) && !entries[x.entryIndex].is_initial).map((x) => entries[x.entryIndex].work_date)
    )
    row.daysWorked = dates.size
    row.lastDay = dates.size ? [...dates].sort().reverse()[0] : null
  }
  return out
}
