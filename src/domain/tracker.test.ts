import { describe, expect, it } from 'vitest'
import fx from './fixtures/pestisani.json'
import {
  boundaries,
  checkpointPlan,
  dayTotals,
  defaultFrom,
  markMap,
  segmentState,
  segmentsInRange,
  summarize,
  workProgress,
  type Checkpoint,
  type Segment,
  type TrackerConfig,
} from './tracker'

const cfg: TrackerConfig = {
  types: [],
  stages: [
    { id: 'sapat', label: 'Săpătură', unit: 'ml' },
    { id: 'teava', label: 'Montaj țeavă', unit: 'ml' },
    { id: 'teava_console', label: 'Țeavă pe console', unit: 'ml' },
  ],
  stagesByType: {
    verde: ['sapat', 'teava'],
    acost: ['sapat', 'teava'],
    console: ['teava_console'],
    suport: ['teava_console'],
  },
}
const segs = fx.segments as Segment[]

describe('tracker: puncte de control', () => {
  it('reperele traseului Peștișani merg de la VJ36 la VJ80', () => {
    const b = boundaries(segs)
    expect(b[0]).toBe('VJ36')
    expect(b[b.length - 1]).toBe('VJ80')
    expect(b.length).toBe(45)
  })

  it('mergând înapoi de la VJ80 la VJ77, porțiunile vin în ordinea frontului', () => {
    expect(segmentsInRange(segs, 'VJ80', 'VJ77').map((s) => s.code)).toEqual(['s79', 's78', 's77'])
  })

  it('„am ajuns cu săpătura la VJ47" bifează doar porțiunile de tranșee nebifate din interval', () => {
    const mm = markMap([{ segment_code: 's46', stage: 'sapat', done_on: '2026-11-01' }])
    const plan = checkpointPlan(cfg, segs, mm, 'sapat', 'VJ49', 'VJ44')
    // VJ45-VJ46 are console (fără săpătură) + 4,1 m acostament; VJ46-VJ47 e deja bifată
    expect(plan.map((s) => s.code)).toEqual(['s48', 's47', 's45b'])
  })

  it('frontul pornește de la ultimul punct de control, altfel de la VJ80', () => {
    const cps: Checkpoint[] = [
      { stage: 'sapat', from_pt: 'VJ80', at_pt: 'VJ60', done_on: '2026-11-01' },
      { stage: 'sapat', from_pt: 'VJ60', at_pt: 'VJ55', done_on: '2026-11-05' },
    ]
    expect(defaultFrom(segs, cps, 'sapat')).toBe('VJ55')
    expect(defaultFrom(segs, cps, 'teava')).toBe('VJ80')
  })

  it('progresul pe lucrare: metri bifați, frontul și ultima zi', () => {
    const mm = markMap([
      { segment_code: 's79', stage: 'sapat', done_on: '2026-11-20' },
      { segment_code: 's78', stage: 'sapat', done_on: '2026-11-21' },
    ])
    const cps: Checkpoint[] = [{ stage: 'sapat', from_pt: 'VJ80', at_pt: 'VJ78', done_on: '2026-11-21' }]
    const p = workProgress(cfg, segs, mm, cps).find((x) => x.stage.id === 'sapat')!
    expect(p.done).toBeCloseTo(42.5, 5)
    expect(p.front?.at_pt).toBe('VJ78')
    expect(p.lastDay).toBe('2026-11-21')
    expect(workProgress(cfg, segs, mm, cps).find((x) => x.stage.id === 'teava_console')!.total).toBeCloseTo(276.8, 1)
  })

  it('porțiunea e gata doar când toate lucrările ei sunt bifate', () => {
    const s79 = segs.find((s) => s.code === 's79')!
    expect(segmentState(cfg, s79, markMap([{ segment_code: 's79', stage: 'sapat', done_on: 'x' }]))).toBe('ip')
    expect(
      segmentState(
        cfg,
        s79,
        markMap([
          { segment_code: 's79', stage: 'sapat', done_on: 'x' },
          { segment_code: 's79', stage: 'teava', done_on: 'x' },
        ])
      )
    ).toBe('done')
    expect(summarize(cfg, segs, markMap([])).total).toBeCloseTo(1248, 1)
  })

  it('jurnalul zilnic: totalul pe coloane', () => {
    const cols = [
      { id: 'sapat', label: 'Săpătură', unit: 'ml' },
      { id: 'sudura_e1', label: 'Echipa 1', unit: 'buc' },
    ]
    expect(dayTotals([{ qty: { sapat: 20, sudura_e1: 1 } }, { qty: { sapat: 30 } }], cols)).toEqual({
      sapat: 50,
      sudura_e1: 1,
    })
  })
})
