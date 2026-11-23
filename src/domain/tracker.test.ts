import { describe, expect, it } from 'vitest'
import fx from './fixtures/pestisani.json'
import {
  allocate,
  boundaries,
  dayTouches,
  segmentHistory,
  segmentState,
  stageState,
  summarize,
  sectionTable,
  workGrid,
  type Entry,
  type Segment,
  type TrackerConfig,
} from './tracker'

const cfg = fx.config as TrackerConfig
const segs = fx.segments as Segment[]

const mini: Segment[] = [
  { code: 'a', from_pt: 'VJ1', to_pt: 'VJ2', part: 0, parts: 1, length_m: 10, kind: 'verde', sort_order: 1 },
  { code: 'b', from_pt: 'VJ2', to_pt: 'VJ3', part: 0, parts: 1, length_m: 20, kind: 'verde', sort_order: 2 },
  { code: 'c', from_pt: 'VJ3', to_pt: 'VJ4', part: 0, parts: 1, length_m: 30, kind: 'verde', sort_order: 3 },
]
const e = (d: string, from: string | null, to: string | null, qty: number, stage = 'sapat'): Entry => ({
  work_date: d,
  stage,
  from_pt: from,
  to_pt: to,
  qty,
})

describe('tracker: împărțirea metrilor pe porțiuni', () => {
  it('reperele traseului Peștișani merg de la VJ36 la VJ80', () => {
    const b = boundaries(segs)
    expect(b[0]).toBe('VJ36')
    expect(b[b.length - 1]).toBe('VJ80')
    expect(b.length).toBe(45)
  })

  it('frontul umple porțiunile în ordine, de la reperul de pornire', () => {
    const a = allocate(cfg, mini, [e('2026-10-01', 'VJ1', 'VJ4', 25)])
    expect(a.filled.get('a')!.get('sapat')).toBe(10)
    expect(a.filled.get('b')!.get('sapat')).toBe(15)
    expect(a.filled.get('c')!.get('sapat') ?? 0).toBe(0)
  })

  it('în sens invers, frontul pornește de la capătul celălalt', () => {
    const a = allocate(cfg, mini, [e('2026-10-01', 'VJ4', 'VJ1', 35)])
    expect(a.filled.get('c')!.get('sapat')).toBe(30)
    expect(a.filled.get('b')!.get('sapat')).toBe(5)
  })

  it('a doua zi continuă de unde a rămas prima și se vede ziua fiecărui metru', () => {
    const entries = [e('2026-10-02', 'VJ1', 'VJ4', 20), e('2026-10-01', 'VJ1', 'VJ4', 15)]
    const a = allocate(cfg, mini, entries)
    expect(a.filled.get('b')!.get('sapat')).toBe(20)
    expect(a.filled.get('c')!.get('sapat')).toBe(5)
    const h = segmentHistory(entries, a, 'b')
    expect(h).toEqual([
      { date: '2026-10-02', stage: 'sapat', qty: 15 },
      { date: '2026-10-01', stage: 'sapat', qty: 5 },
    ])
    expect([...dayTouches(entries, a, '2026-10-01').keys()]).toEqual(['a', 'b'])
  })

  it('ce nu încape în interval rămâne neatribuit', () => {
    const a = allocate(cfg, mini, [e('2026-10-01', 'VJ1', 'VJ2', 14)])
    expect(a.filled.get('a')!.get('sapat')).toBe(10)
    expect(a.unplaced.get(0)).toBeCloseTo(4, 5)
  })

  it('reper necunoscut: nimic atribuit', () => {
    const a = allocate(cfg, mini, [e('2026-10-01', 'VJ9', 'VJ2', 5)])
    expect(a.allocs.length).toBe(0)
    expect(a.unplaced.get(0)).toBe(5)
  })

  it('lucrările în bucăți (suduri, console) nu se pun pe hartă', () => {
    const a = allocate(cfg, segs, [e('2026-10-01', 'VJ36', 'VJ49', 3, 'sudura')])
    expect(a.allocs.length).toBe(0)
    expect(a.unplaced.size).toBe(0)
  })

  it('rândurile fără VJ nu se pun pe hartă și nu dau avertisment', () => {
    const a = allocate(cfg, mini, [{ ...e('2026-10-01', 'VJ1', 'VJ2', 5), from_pt: null, to_pt: null }])
    expect(a.allocs.length).toBe(0)
    expect(a.unplaced.size).toBe(0)
  })

  it('țeava pe console umple și suportul, și consolele din interval', () => {
    // VJ39-VJ40 = 10,3 m suport + 16 m console
    const a = allocate(cfg, segs, [e('2026-10-01', 'VJ39', 'VJ40', 20, 'teava_console')])
    expect(a.filled.get('s39a')!.get('teava_console')).toBeCloseTo(10.3, 5)
    expect(a.filled.get('s39b')!.get('teava_console')).toBeCloseTo(9.7, 5)
  })

  it('stările: gata, în lucru, neînceput', () => {
    expect(stageState(mini[0], 10)).toBe('done')
    expect(stageState(mini[0], 3)).toBe('ip')
    expect(stageState(mini[0], 0)).toBe('ns')
  })
})

describe('tracker: pe zile și pe porțiuni (ca în Excel)', () => {
  const entries: Entry[] = [
    { ...e('2026-10-13', 'VJ1', 'VJ1', 376.9), from_pt: null, to_pt: null, is_initial: true },
    e('2026-10-15', 'VJ62', 'VJ63', 30),
    e('2026-10-15', 'VJ62', 'VJ63', 5, 'sudura'),
    { ...e('2026-10-16', 'x', 'x', 40), from_pt: null, to_pt: null },
    e('2026-10-19', 'VJ65', 'VJ72', 40),
    { ...e('2026-10-19', 'x', 'x', 1), stage: null, qty: null, from_pt: 'Cămin CVGA VJ194', to_pt: null },
  ]

  it('rândul de săpătură: de executat, realizat, rămas, media pe zi lucrată, pe zile', () => {
    const g = workGrid(cfg, segs, entries, '2026-10-20')
    expect(g.days[0]).toBe('2026-10-15')
    expect(g.days[g.days.length - 1]).toBe('2026-10-20')
    const r = g.rows.find((x) => x.stage.id === 'sapat')!
    expect(r.total).toBeCloseTo(971.2, 1)
    expect(r.initial).toBeCloseTo(376.9, 5)
    expect(r.done).toBeCloseTo(486.9, 5)
    expect(r.left).toBeCloseTo(484.3, 1)
    expect(r.perDayAvg).toBeCloseTo(110 / 3, 5)
    expect(r.perDay.get('2026-10-19')).toBe(40)
    expect(r.perDay.has('2026-10-13')).toBe(false)
  })

  it('țeava pe console are de executat suportul + consolele; sudurile n-au țintă', () => {
    const g = workGrid(cfg, segs, entries, '2026-10-20')
    expect(g.rows.find((x) => x.stage.id === 'teava_console')!.total).toBeCloseTo(276.8, 1)
    const sud = g.rows.find((x) => x.stage.id === 'sudura')!
    expect(sud.total).toBeNull()
    expect(sud.done).toBe(5)
  })

  it('pe porțiuni: VJ65-VJ66 săpată pe 19.10, porțiunile împărțite se adună', () => {
    const a = allocate(cfg, segs, entries)
    const t = sectionTable(cfg, segs, entries, a)
    expect(t.length).toBe(44)
    const r = t.find((x) => x.from === 'VJ65')!
    expect(r.byStage.get('sapat')!.done).toBeCloseTo(27.8, 5)
    expect(r.daysWorked).toBe(1)
    expect(r.lastDay).toBe('2026-10-19')
    const split = t.find((x) => x.from === 'VJ38')!
    expect(split.length).toBeCloseTo(29.2, 5)
  })

  it('totalul traseului rămâne 1.248 m', () => {
    const sum = summarize(cfg, segs, allocate(cfg, segs, entries))
    expect(sum.total).toBeCloseTo(1248, 1)
    expect(segmentState(cfg, segs.find((s) => s.code === 's65')!, allocate(cfg, segs, entries))).toBe('ip')
  })
})
