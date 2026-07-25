// Teste pentru stratul-adaptor (decorare, merge P&L) și reducer-ul cu patch-uri
// optimiste — nucleul refactorului v3. Toate funcțiile testate sunt pure.
import { describe, expect, it, vi } from 'vitest'

// Funcțiile testate sunt pure — clientul Supabase (importat la nivel de modul
// de projects.ts) nu e necesar și nici nu pornește în Node 20 (fără WebSocket).
vi.mock('../lib/supabase', () => ({ supabase: {} as never }))
import {
  decorateProject,
  mergePnlCosts,
  treeReducer,
  type PnlCosts,
  type ProjectRow,
  type ProjectWithKpis,
  type TreeState,
} from './projects'

const TODAY = '2026-07-10'

/** Proiect minimal: 1 job (1–20 iulie), 1 task de 100.000, 1 livrabil 50/100. */
function makeRawProject(over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'p1',
    name: 'Proiect test',
    client: null,
    billing_mode: 'stadii_fizice',
    contract_value: 100_000,
    start_date: '2026-07-01',
    end_date: '2026-07-20',
    active: true,
    location: null,
    pnl_proiect_id: null,
    is_small: false,
    sort_order: 1,
    jobs: [
      {
        id: 'j1',
        name: 'Job 1',
        start_date: '2026-07-01',
        end_date: '2026-07-20',
        sort_order: 1,
        baseline_start_date: '2026-07-01',
        baseline_end_date: '2026-07-20',
        cvr_job_billing: { depus: 10_000, certificat: 5_000, facturat: 5_000, incasat: 5_000 },
        tasks: [
          {
            id: 't1',
            name: 'Task 1',
            value: 100_000,
            status: 'in_lucru',
            sort_order: 1,
            planned_man_days: null,
            start_date: '2026-07-01',
            end_date: '2026-07-20',
            target_invoice_date: null,
            deliverables: [
              {
                id: 'd1',
                name: 'Livrabil 1',
                um: 'm',
                qty_total: 100,
                qty_done: 50,
                weight: 100,
                sort_order: 1,
                planned_man_days: null,
              },
            ],
          },
        ],
        cvr_job_budgets: [{ category: 'manopera', amount: 60_000 }],
        cvr_cost_entries: [
          { id: 'c1', category: 'manopera', amount: 20_000, description: null, entry_date: TODAY },
        ],
      },
    ],
    ...over,
  }
}

describe('decorateProject', () => {
  it('sortează joburile, taskurile și livrabilele după sort_order', () => {
    const raw = makeRawProject()
    raw.jobs = [
      { ...raw.jobs[0], id: 'j2', sort_order: 2 },
      { ...raw.jobs[0], id: 'j1', sort_order: 1 },
    ]
    raw.jobs[0].tasks = [
      { ...raw.jobs[0].tasks[0], id: 't2', sort_order: 2 },
      { ...raw.jobs[0].tasks[0], id: 't1', sort_order: 1 },
    ]
    const p = decorateProject(raw, TODAY)
    expect(p.jobs.map((j) => j.id)).toEqual(['j1', 'j2'])
    expect(p.jobs[1].tasks.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('tolerează situația jobului ca obiect SAU array (cache-ul de schemă PostgREST)', () => {
    const asObj = decorateProject(makeRawProject(), TODAY)
    const arr = makeRawProject()
    arr.jobs[0].cvr_job_billing = [
      { depus: 10_000, certificat: 5_000, facturat: 5_000, incasat: 5_000 },
    ]
    const asArr = decorateProject(arr, TODAY)
    expect(asObj.billing).toEqual(asArr.billing)
    expect(asObj.billing.depus).toBe(10_000)
  })

  it('facturarea proiectului = suma situațiilor joburilor (rollup)', () => {
    const raw = makeRawProject()
    raw.jobs = [
      raw.jobs[0],
      {
        ...raw.jobs[0],
        id: 'j2',
        sort_order: 2,
        cvr_job_billing: { depus: 1_000, certificat: 0, facturat: 500, incasat: 250 },
        tasks: [],
      },
    ]
    const p = decorateProject(raw, TODAY)
    expect(p.billing.depus).toBe(11_000)
    expect(p.billing.facturat).toBe(5_500)
    expect(p.kpis.billing.incasat).toBe(5_250)
  })

  it('calculează KPI-urile: 50% realizat → EV 50.000, WIP = EV − depus', () => {
    const p = decorateProject(makeRawProject(), TODAY)
    expect(p.kpis.ev).toBeCloseTo(50_000)
    expect(p.kpis.donePct).toBeCloseTo(0.5)
    expect(p.kpis.wip).toBeCloseTo(40_000)
  })
})

describe('mergePnlCosts', () => {
  const pnl: PnlCosts = {
    manopera: 10_000,
    materiale: 0,
    subcontractori: 0,
    combustibil: 5_000,
    echipamente: 0,
    overheads: 0,
    total: 15_000,
  }

  it('NU atinge proiectele fără legătură P&L (demo-urile își păstrează costurile manuale)', () => {
    const p = decorateProject(makeRawProject(), TODAY) // pnl_proiect_id: null
    const [merged] = mergePnlCosts([p], new Map([[p.id, pnl]]))
    expect(merged).toBe(p)
    expect(merged.pnlCosts).toBeNull()
  })

  it('înlocuiește costul și recalculează variația și marja pentru proiectele legate', () => {
    const p = decorateProject(makeRawProject({ pnl_proiect_id: 'pnl-1' }), TODAY)
    const earnedBudget = p.kpis.costVariance + p.kpis.actualCost // buget × %realizat
    const [merged] = mergePnlCosts([p], new Map([[p.id, pnl]]))
    expect(merged.pnlCosts).toEqual(pnl)
    expect(merged.kpis.actualCost).toBe(15_000)
    expect(merged.kpis.costVariance).toBeCloseTo(earnedBudget - 15_000)
    expect(merged.kpis.margin).toBeCloseTo((merged.kpis.ev - 15_000) / merged.kpis.ev)
  })
})

describe('treeReducer — patch-uri optimiste', () => {
  function makeState(projects: ProjectWithKpis[], pnlMap: TreeState['pnlMap'] = null): TreeState {
    return { projects, loading: false, error: null, pnlMap }
  }

  it('patch pe livrabil recalculează KPI-urile proiectului atins', () => {
    const p = decorateProject(makeRawProject(), TODAY)
    const next = treeReducer(makeState([p]), {
      type: 'patched',
      patch: { kind: 'deliverable', id: 'd1', patch: { qty_done: 100 } },
      today: TODAY,
    })
    expect(next.projects[0].kpis.donePct).toBeCloseTo(1)
    expect(next.projects[0].kpis.ev).toBeCloseTo(100_000)
  })

  it('proiectele neatinse își păstrează identitatea (referință egală)', () => {
    const p1 = decorateProject(makeRawProject(), TODAY)
    // p2 cu id-uri interne DIFERITE (altfel patch-ul pe „d1" l-ar atinge și pe el)
    const raw2 = makeRawProject({ id: 'p2' })
    raw2.jobs = [
      {
        ...raw2.jobs[0],
        id: 'j9',
        tasks: [
          {
            ...raw2.jobs[0].tasks[0],
            id: 't9',
            deliverables: [{ ...raw2.jobs[0].tasks[0].deliverables[0], id: 'd9' }],
          },
        ],
      },
    ]
    const p2 = decorateProject(raw2, TODAY)
    const next = treeReducer(makeState([p1, p2]), {
      type: 'patched',
      patch: { kind: 'deliverable', id: 'd1', patch: { qty_done: 75 } },
      today: TODAY,
    })
    expect(next.projects[0]).not.toBe(p1)
    expect(next.projects[1]).toBe(p2)
  })

  it('patch-ul invers readuce KPI-urile la valorile inițiale (modelul de revert)', () => {
    const p = decorateProject(makeRawProject(), TODAY)
    const s0 = makeState([p])
    const s1 = treeReducer(s0, {
      type: 'patched',
      patch: { kind: 'deliverable', id: 'd1', patch: { qty_done: 100 } },
      today: TODAY,
    })
    const s2 = treeReducer(s1, {
      type: 'patched',
      patch: { kind: 'deliverable', id: 'd1', patch: { qty_done: 50 } },
      today: TODAY,
    })
    expect(s2.projects[0].kpis.donePct).toBeCloseTo(p.kpis.donePct)
    expect(s2.projects[0].kpis.ev).toBeCloseTo(p.kpis.ev)
  })

  it('după patch, costul din P&L rămâne aplicat (pnlMap ținut în stare)', () => {
    const pnl: PnlCosts = {
      manopera: 15_000,
      materiale: 0,
      subcontractori: 0,
      combustibil: 0,
      echipamente: 0,
      overheads: 0,
      total: 15_000,
    }
    const map = new Map([['p1', pnl]])
    const p = mergePnlCosts(
      [decorateProject(makeRawProject({ pnl_proiect_id: 'pnl-1' }), TODAY)],
      map
    )[0]
    const next = treeReducer(makeState([p], map), {
      type: 'patched',
      patch: { kind: 'deliverable', id: 'd1', patch: { qty_done: 100 } },
      today: TODAY,
    })
    // KPI-urile s-au recalculat (100%), dar costul rămâne cel din P&L
    expect(next.projects[0].kpis.donePct).toBeCloseTo(1)
    expect(next.projects[0].kpis.actualCost).toBe(15_000)
    expect(next.projects[0].pnlCosts).toEqual(pnl)
  })

  it('patch pe datele unui task se vede în arbore (bara din Gantt)', () => {
    const p = decorateProject(makeRawProject(), TODAY)
    const next = treeReducer(makeState([p]), {
      type: 'patched',
      patch: { kind: 'task', id: 't1', patch: { start_date: '2026-07-05', end_date: '2026-07-25' } },
      today: TODAY,
    })
    const t = next.projects[0].jobs[0].tasks[0]
    expect(t.start_date).toBe('2026-07-05')
    expect(t.end_date).toBe('2026-07-25')
  })

  it('patch pe situația unui JOB recalculează cash-ul proiectului (rollup)', () => {
    const p = decorateProject(makeRawProject(), TODAY)
    const next = treeReducer(makeState([p]), {
      // id-ul e al JOBULUI: facturarea stă pe job din 0017
      type: 'patched',
      patch: { kind: 'billing', id: 'j1', patch: { facturat: 50_000, incasat: 25_000 } },
      today: TODAY,
    })
    expect(next.projects[0].billing.facturat).toBe(50_000)
    expect(next.projects[0].kpis.cashPct).toBeCloseTo(0.5)
  })
})
