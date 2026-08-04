// Vectorii EXACȚI din BRIEF.md, toleranță ±0,01.
import { describe, expect, it } from 'vitest'
import {
  baselineSlipDays,
  behindDays,
  cashColor,
  cashPct,
  costColor,
  costVariance,
  deliverablePct,
  eacCost,
  effortKpis,
  forecastMargin,
  jobKpis,
  jobPlanPct,
  margin,
  marginColor,
  marginIfPendingLand,
  marginPointsVsPlan,
  outstandingAgeDays,
  planPct,
  plannedMargin,
  projectKpis,
  retentionHeld,
  scheduleVarianceLei,
  scheduleColor,
  taskEV,
  taskPct,
  weightedOutstandingAge,
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

  it('projectKpis: medii ponderate cu valoarea și cash din facturarea joburilor', () => {
    // facturarea vine acum din situația jobului (rollup), nu de pe proiect
    const jobWithBilling = {
      ...job,
      billing: { depus: 20000, certificat: 15000, facturat: 10000, incasat: 9500 },
    }
    const p = projectKpis([jobWithBilling], '2026-02-09')
    expect(p.ev).toBeCloseTo(35424, 0)
    expect(p.planPct).toBeCloseTo(0.39, 4)
    expect(p.behindDays).toBeCloseTo(3.58, 1)
    expect(p.cashPct).toBeCloseTo(0.95, 4)
    expect(p.wip).toBeCloseTo(15424, 0)
    // rollup-ul facturării ajunge pe proiect
    expect(p.billing.facturat).toBe(10000)
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

describe('prognoză, abateri și efort (v3.1)', () => {
  it('eacCost: extrapolează costul la final; tace sub 10% realizat', () => {
    expect(eacCost(362_000, 0.182)).toBeCloseTo(1_989_010, -2)
    expect(eacCost(1000, 0.05)).toBeNull() // prea devreme ca să însemne ceva
    expect(eacCost(0, 0)).toBeNull()
  })

  it('forecastMargin: marja estimată la final', () => {
    const eac = eacCost(500_000, 0.5) // → 1.000.000
    expect(eac).toBeCloseTo(1_000_000)
    expect(forecastMargin(1_250_000, eac)).toBeCloseTo(0.2)
    expect(forecastMargin(1_000_000, null)).toBeNull()
  })

  it('scheduleVarianceLei: întârzierea în bani', () => {
    // ar fi trebuit 50%, s-a făcut 30%, contract 1M → 200k de muncă restantă
    expect(scheduleVarianceLei(0.5, 0.3, 1_000_000)).toBeCloseTo(200_000)
    // în avans → negativ
    expect(scheduleVarianceLei(0.3, 0.5, 1_000_000)).toBeCloseTo(-200_000)
  })

  it('baselineSlipDays: cât s-a mutat finalul față de planul inițial', () => {
    expect(baselineSlipDays('2026-09-30', '2026-10-18')).toBe(18)
    expect(baselineSlipDays('2026-09-30', '2026-09-20')).toBe(-10)
    expect(baselineSlipDays(null, '2026-10-18')).toBeNull()
  })

  it('effortKpis: verdictul e în oameni-zile, nu în procente amestecate', () => {
    // 169 planificate, 139 consumate, 100% fizic → ai câștigat tot planul
    const done = effortKpis(169, 139, 1)
    expect(done.earned).toBeCloseTo(169)
    expect(done.variance).toBeCloseTo(30) // economie de 30 oameni-zile
    expect(done.consumedPct).toBeCloseTo(139 / 169)

    // 169 planificate, 139 consumate, dar doar 61,5% fizic → depășire
    const mid = effortKpis(169, 139, 0.615)
    expect(mid.earned).toBeCloseTo(103.9, 1)
    expect(mid.variance).toBeLessThan(0)
    expect(mid.variance).toBeCloseTo(-35.1, 1)
  })

  it('jobKpis: aduce baseline, întârzierea în lei și facturarea jobului', () => {
    const j = {
      startDate: '2026-01-01',
      endDate: '2026-01-11', // 10 zile
      baselineEndDate: '2026-01-01',
      billing: { depus: 1000, certificat: 0, facturat: 800, incasat: 400 },
      budgetTotal: 0,
      actualCost: 0,
      tasks: [
        {
          value: 10_000,
          status: 'in_lucru' as const,
          deliverables: [{ qtyDone: 0, qtyTotal: 10, weight: 100 }],
        },
      ],
    }
    const k = jobKpis(j, '2026-01-06') // 50% din interval, 0% realizat
    expect(k.baselineSlipDays).toBe(10) // finalul s-a mutat cu 10 zile
    expect(k.scheduleVarianceLei).toBeCloseTo(5000) // jumătate din valoare, restantă
    expect(k.billing.facturat).toBe(800)
    expect(k.wip).toBeCloseTo(0) // EV 0 − depus 1000 → clamp la 0
  })
})

describe('panoul de bord (v4)', () => {
  it('plannedMargin: reperul gri de pe barele de marjă', () => {
    // contract 100k, buget de cost 88k → marja planificată 12%
    expect(plannedMargin(100_000, 88_000)).toBeCloseTo(0.12)
    expect(plannedMargin(100_000, 0)).toBeNull() // fără buget nu există plan
    expect(plannedMargin(0, 5000)).toBeNull()
  })

  it('marginPointsVsPlan: diferența în puncte procentuale', () => {
    expect(marginPointsVsPlan(0.086, 0.098)).toBeCloseTo(-1.2, 5)
    expect(marginPointsVsPlan(0.13, 0.12)).toBeCloseTo(1, 5)
    expect(marginPointsVsPlan(0.13, null)).toBeNull()
  })

  it('retentionHeld: garanția reținută din facturat', () => {
    expect(retentionHeld(476_175, 5)).toBeCloseTo(23_808.75)
    expect(retentionHeld(476_175, 0)).toBe(0)
  })

  it('outstandingAgeDays / weightedOutstandingAge', () => {
    expect(outstandingAgeDays('2026-07-01', '2026-08-04')).toBe(34)
    expect(outstandingAgeDays(null, '2026-08-04')).toBeNull()
    // factură viitoare → 0, nu negativ
    expect(outstandingAgeDays('2026-09-01', '2026-08-04')).toBe(0)

    // media e ponderată cu suma: 100k la 10 zile + 900k la 40 → aproape de 37
    const avg = weightedOutstandingAge([
      { outstanding: 100_000, ageDays: 10 },
      { outstanding: 900_000, ageDays: 40 },
    ])
    expect(avg).toBeCloseTo(37, 5)
    // rândurile fără dată sunt ignorate, nu trag media în jos
    expect(weightedOutstandingAge([{ outstanding: 5000, ageDays: null }])).toBeNull()
  })

  it('marginIfPendingLand: variațiile în așteptare urcă marja', () => {
    // EV 100k, cost 91,4k → marjă 8,6%; cu 8k variații în așteptare → ~15,4%
    const acum = margin(100_000, 91_400)
    const dupa = marginIfPendingLand(100_000, 8_000, 91_400)
    expect(acum).toBeCloseTo(0.086, 3)
    expect(dupa).toBeGreaterThan(acum)
    expect(dupa).toBeCloseTo((108_000 - 91_400) / 108_000, 5)
  })
})
