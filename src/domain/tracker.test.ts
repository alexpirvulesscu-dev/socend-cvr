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
const e = (d: string, from: string, to: string, qty: number, stage = 'sapat'): Entry => ({
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

  it('etapa se aplică doar porțiunilor care o au (consolele nu se sapă)', () => {
    // VJ39-VJ40 = 10,3 m suport + 16 m console; „console montate" există doar pe console
    const a = allocate(cfg, segs, [e('2026-10-01', 'VJ39', 'VJ40', 16, 'console')])
    expect(a.filled.get('s39b')!.get('console')).toBe(16)
    expect(a.filled.get('s39a')!.get('console') ?? 0).toBe(0)
  })

  it('stările: gata, în lucru, neînceput', () => {
    expect(stageState(mini[0], 10)).toBe('done')
    expect(stageState(mini[0], 3)).toBe('ip')
    expect(stageState(mini[0], 0)).toBe('ns')
  })
})

describe('tracker: pornirea Peștișani din pagina veche', () => {
  const a = allocate(cfg, segs, fx.entries as Entry[])

  it('fiecare etapă bifată pe pagina veche iese „gata", restul „neînceput"', () => {
    for (const s of segs) {
      const exp = (fx.expected as Record<string, Record<string, string>>)[s.code]
      for (const [stage, st] of Object.entries(exp)) {
        expect(`${s.code}/${stage}=${stageState(s, a.filled.get(s.code)?.get(stage) ?? 0)}`).toBe(
          `${s.code}/${stage}=${st}`
        )
      }
    }
    expect(a.unplaced.size).toBe(0)
  })

  it('totalul traseului și porțiunile în lucru', () => {
    const sum = summarize(cfg, segs, a)
    expect(sum.total).toBeCloseTo(1248, 1)
    expect(sum.byState.ns + sum.byState.ip + sum.byState.done).toBeCloseTo(sum.total, 5)
    // consolele VJ39-VJ46 sunt complet gata pe pagina veche
    expect(segmentState(cfg, segs.find((s) => s.code === 's40')!, a)).toBe('done')
  })
})
