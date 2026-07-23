// Vectorii EXACȚI din BRIEF.md, toleranță ±0,01.
import { describe, expect, it } from 'vitest'
import {
  behindDays,
  cashColor,
  cashPct,
  costColor,
  costVariance,
  deliverablePct,
  jobKpis,
  jobPlanPct,
  margin,
  marginColor,
  planPct,
  projectKpis,
  scheduleColor,
  taskEV,
  taskPct,
  wip,
} from './kpi'

describe('vectorii din BRIEF (toleranță ±0,01)', () => {
  it('task_pct(62/100 w50, 118/180 w30, 3/6 w10, 7/12 w10) = 0,615', () => {
    const pct = taskPct([
      { qtyDone: 62, qtyTotal: 100, weight: 50 },
      { qtyDone: 118, qtyTotal: 180, weight: 30 },
      { qtyDone: 3, qtyTotal: 6, weight: 10 },
      { qtyDone: 7, qtyTotal: 12, weight: 10 },
    ])
    expect(Math.abs(pct - 0.615)).toBeLessThanOrEqual(0.01)
  })

  it('EV = 57.600 × 0,615 = 35.424', () => {
    const ev = taskEV({
      value: 57600,
      status: 'in_lucru',
      deliverables: [
        { qtyDone: 62, qtyTotal: 100, weight: 50 },
        { qtyDone: 118, qtyTotal: 180, weight: 30 },
        { qtyDone: 3, qtyTotal: 6, weight: 10 },
        { qtyDone: 7, qtyTotal: 12, weight: 10 },
      ],
    })
    // toleranța ±0,01 din BRIEF e pe procente; pe lei acceptăm sub 1 leu
    expect(Math.abs(ev - 35424)).toBeLessThan(1)
  })

  it('task_pct(310/704 w100) = 0,4403', () => {
    const pct = taskPct([{ qtyDone: 310, qtyTotal: 704, weight: 100 }])
    expect(Math.abs(pct - 0.4403)).toBeLessThanOrEqual(0.01)
  })

  it('margin(EV 100.000, cost 76.500) = 0,235', () => {
    expect(Math.abs(margin(100000, 76500) - 0.235)).toBeLessThanOrEqual(0.01)
  })

  it('behind_days(plan 0,39, done 0,354, 100 zile) = 3,6', () => {
    expect(Math.abs(behindDays(0.39, 0.354, 100) - 3.6)).toBeLessThanOrEqual(0.01)
  })
})

describe('formule de bază — margini și cazuri limită', () => {
  it('deliverable_pct nu trece de 1 (done > total)', () => {
    expect(deliverablePct(120, 100)).toBe(1)
  })

  it('deliverable_pct cu total 0 → 0', () => {
    expect(deliverablePct(5, 0)).toBe(0)
  })

  it('task_pct fără livrabile → 0', () => {
    expect(taskPct([])).toBe(0)
  })

  it('plan_pct e limitat la [0, 1]', () => {
    expect(planPct('2026-05-01', '2026-06-01', '2026-04-01')).toBe(0)
    expect(planPct('2026-05-01', '2026-06-01', '2026-07-01')).toBe(1)
  })

  it('plan_pct la mijlocul intervalului = 0,5', () => {
    expect(planPct('2026-05-01', '2026-05-31', '2026-05-16')).toBeCloseTo(0.5, 2)
  })

  it('cost_var pozitiv = sub buget, negativ = peste buget', () => {
    expect(costVariance(100000, 0.5, 40000)).toBe(10000)
    expect(costVariance(100000, 0.5, 60000)).toBe(-10000)
  })

  it('margin cu EV 0 → 0 (nu împarte la zero)', () => {
    expect(margin(0, 5000)).toBe(0)
  })

  it('WIP nu coboară sub 0', () => {
    expect(wip(100, 500)).toBe(0)
    expect(wip(500, 100)).toBe(400)
  })

  it('cash_pct fără facturare → 1', () => {
    expect(cashPct(0, 0)).toBe(1)
    expect(cashPct(380000, 476175)).toBeCloseTo(0.798, 2)
  })
})

describe('agregări job și proiect', () => {
  const job = {
    startDate: '2026-01-01',
    endDate: '2026-04-11', // 100 zile
    budgetTotal: 100000,
    actualCost: 30000,
    tasks: [
      {
        value: 57600,
        status: 'in_lucru' as const,
        deliverables: [
          { qtyDone: 62, qtyTotal: 100, weight: 50 },
          { qtyDone: 118, qtyTotal: 180, weight: 30 },
          { qtyDone: 3, qtyTotal: 6, weight: 10 },
          { qtyDone: 7, qtyTotal: 12, weight: 10 },
        ],
      },
      {
        value: 42400,
        status: 'neinceput' as const,
        deliverables: [{ qtyDone: 0, qtyTotal: 100, weight: 100 }],
      },
    ],
  }

  it('jobKpis: EV, done_pct, plan, behind, cost_var, margin coerente', () => {
    const k = jobKpis(job, '2026-02-09') // ziua 39 din 100 → plan 0,39
    expect(k.value).toBe(100000)
    expect(k.ev).toBeCloseTo(35424, 0)
    expect(k.donePct).toBeCloseTo(0.35424, 4)
    expect(k.planPct).toBeCloseTo(0.39, 4)
    // behind = (0,39 − 0,35424) × 100 = 3,576 → exemplul „3,6 zile" din BRIEF
    expect(k.behindDays).toBeCloseTo(3.58, 1)
    expect(k.costVariance).toBeCloseTo(100000 * 0.35424 - 30000, 0)
    expect(k.margin).toBeCloseTo((35424 - 30000) / 35424, 4)
  })

  it('projectKpis: medii ponderate cu valoarea și cash din facturare', () => {
    const p = projectKpis([job], { depus: 20000, certificat: 15000, facturat: 10000, incasat: 9500 }, '2026-02-09')
    expect(p.ev).toBeCloseTo(35424, 0)
    expect(p.planPct).toBeCloseTo(0.39, 4)
    expect(p.behindDays).toBeCloseTo(3.58, 1)
    expect(p.cashPct).toBeCloseTo(0.95, 4)
    expect(p.wip).toBeCloseTo(15424, 0)
  })
})

describe('culorile KPI (pragurile din CLAUDE.md)', () => {
  it('grafic: <2 bine, 2–7 atenție, >7 problemă', () => {
    expect(scheduleColor(1.9)).toBe('good')
    expect(scheduleColor(2)).toBe('warning')
    expect(scheduleColor(7)).toBe('warning')
    expect(scheduleColor(7.1)).toBe('error')
    expect(scheduleColor(-3)).toBe('good') // în avans
  })

  it('cost: ≥0 bine, altfel problemă', () => {
    expect(costColor(0)).toBe('good')
    expect(costColor(-0.01)).toBe('error')
  })

  it('marjă: ≥15% bine, 8–15% atenție, sub 8% problemă', () => {
    expect(marginColor(0.15)).toBe('good')
    expect(marginColor(0.1)).toBe('warning')
    expect(marginColor(0.08)).toBe('warning')
    expect(marginColor(0.079)).toBe('error')
  })

  it('cash: ≥90% bine, 70–90% atenție, sub 70% problemă', () => {
    expect(cashColor(0.9)).toBe('good')
    expect(cashColor(0.8)).toBe('warning')
    expect(cashColor(0.69)).toBe('error')
  })
})

describe('jobPlanPct — rafinarea v3 cu datele taskurilor', () => {
  const base = {
    startDate: '2026-07-01',
    endDate: '2026-07-21', // 20 de zile → azi (11 iul.) = 50% plan pe fereastra jobului
    budgetTotal: 0,
    actualCost: 0,
  }
  const TODAY = '2026-07-11'
  const deliv = [{ qtyDone: 0, qtyTotal: 1, weight: 100 }]

  it('taskuri fără date proprii → identic cu formula veche pe fereastra jobului', () => {
    const job = {
      ...base,
      tasks: [
        { value: 100, status: 'in_lucru' as const, deliverables: deliv },
        { value: 300, status: 'neinceput' as const, deliverables: deliv },
      ],
    }
    expect(Math.abs(jobPlanPct(job, TODAY) - planPct(base.startDate, base.endDate, TODAY))).toBeLessThanOrEqual(0.001)
  })

  it('taskurile cu date proprii mută planul (medie ponderată cu valoarea)', () => {
    const job = {
      ...base,
      tasks: [
        // task terminat ca plan: 1–11 iul. → plan 100%
        { value: 100, status: 'in_lucru' as const, deliverables: deliv, startDate: '2026-07-01', endDate: '2026-07-11' },
        // task viitor: 21–31 iul. → plan 0%
        { value: 100, status: 'neinceput' as const, deliverables: deliv, startDate: '2026-07-21', endDate: '2026-07-31' },
      ],
    }
    expect(Math.abs(jobPlanPct(job, TODAY) - 0.5)).toBeLessThanOrEqual(0.001)
  })

  it('fără taskuri → fereastra jobului', () => {
    const job = { ...base, tasks: [] }
    expect(Math.abs(jobPlanPct(job, TODAY) - 0.5)).toBeLessThanOrEqual(0.001)
  })
})
