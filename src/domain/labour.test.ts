import { describe, expect, it } from 'vitest'
import {
  averagePerDay,
  byWeek,
  forecastHours,
  hoursLeft,
  labourCurve,
  labourVerdict,
  plannedHours,
  weekStart,
  workingDaysBetween,
} from './labour'

describe('plannedHours', () => {
  it('numărul declarat bate suma copiilor', () => {
    expect(plannedHours({ declared: 1000, children: [100, 200] })).toBe(1000)
  })

  it('fără număr declarat, adună copiii', () => {
    expect(plannedHours({ declared: null, children: [100, 200, 50] })).toBe(350)
  })

  it('un zero declarat nu blochează suma copiilor', () => {
    expect(plannedHours({ declared: 0, children: [80] })).toBe(80)
  })

  it('fără plan și fără copii, planul e zero', () => {
    expect(plannedHours({ declared: null, children: [] })).toBe(0)
  })
})

describe('labourVerdict', () => {
  it('fără plan nu există verdict', () => {
    expect(labourVerdict(0, 500)).toBe('fara_plan')
  })

  it('sub 90% din plan e confortabil', () => {
    expect(labourVerdict(1000, 500)).toBe('sub_plan')
  })

  it('între 90 și 100% e „aproape"', () => {
    expect(labourVerdict(1000, 900)).toBe('aproape')
    expect(labourVerdict(1000, 1000)).toBe('aproape')
  })

  it('peste plan e depășire', () => {
    expect(labourVerdict(1000, 1001)).toBe('peste_plan')
  })
})

describe('hoursLeft', () => {
  it('pozitiv sub plan, negativ la depășire', () => {
    expect(hoursLeft(1000, 400)).toBe(600)
    expect(hoursLeft(1000, 1200)).toBe(-200)
  })
})

describe('workingDaysBetween', () => {
  it('numără doar luni–vineri, capetele incluse', () => {
    // 2026-08-03 e luni, 2026-08-07 e vineri
    expect(workingDaysBetween('2026-08-03', '2026-08-07')).toBe(5)
  })

  it('sare peste weekend', () => {
    // 2026-08-08 sâmbătă, 2026-08-09 duminică
    expect(workingDaysBetween('2026-08-08', '2026-08-09')).toBe(0)
  })

  it('o singură zi lucrătoare se numără o dată', () => {
    expect(workingDaysBetween('2026-08-05', '2026-08-05')).toBe(1)
  })

  it('interval inversat dă zero', () => {
    expect(workingDaysBetween('2026-08-07', '2026-08-03')).toBe(0)
  })
})

describe('averagePerDay', () => {
  it('împarte la zilele LUCRATE, nu la cele de calendar', () => {
    const days = [{ hours: 16 }, { hours: 0 }, { hours: 0 }, { hours: 8 }]
    expect(averagePerDay(days)).toBe(12)
  })

  it('fără zile lucrate, ritmul e zero', () => {
    expect(averagePerDay([{ hours: 0 }])).toBe(0)
  })
})

describe('labourCurve', () => {
  const days = [
    { work_date: '2026-08-03', hours: 16 },
    { work_date: '2026-08-04', hours: 8 },
    { work_date: '2026-08-05', hours: 24 },
  ]

  it('cumulează consumul în ordine cronologică', () => {
    const c = labourCurve(days, 0, null, null)
    expect(c.map((p) => p.cumulative)).toEqual([16, 24, 48])
  })

  it('fără fereastră de plan nu desenează linia planului', () => {
    const c = labourCurve(days, 100, null, null)
    expect(c.every((p) => p.plannedCumulative === null)).toBe(true)
  })

  it('întinde planul liniar peste zilele lucrătoare', () => {
    // 5 zile lucrătoare, 100 ore ⇒ 20 ore/zi lucrătoare
    const c = labourCurve(days, 100, '2026-08-03', '2026-08-07')
    expect(c.map((p) => p.plannedCumulative)).toEqual([20, 40, 60])
  })

  it('planul cumulat nu trece niciodată peste total', () => {
    const late = [{ work_date: '2026-09-30', hours: 8 }]
    const c = labourCurve(late, 100, '2026-08-03', '2026-08-07')
    expect(c[0].plannedCumulative).toBe(100)
  })

  it('sortează zilele primite în dezordine', () => {
    const shuffled = [days[2], days[0], days[1]]
    const c = labourCurve(shuffled, 0, null, null)
    expect(c.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05'])
  })
})

describe('forecastHours', () => {
  it('fără fereastră de plan nu se poate estima', () => {
    expect(forecastHours(100, [{ work_date: '2026-08-03', hours: 8 }], null, null, '2026-08-05'))
      .toBeNull()
  })

  it('duce ritmul de până acum peste zilele lucrătoare rămase', () => {
    const days = [
      { work_date: '2026-08-03', hours: 8 },
      { work_date: '2026-08-04', hours: 8 },
    ]
    // ritm 8 ore/zi, rămân 3 zile lucrătoare (5, 6, 7 august)
    expect(forecastHours(16, days, '2026-08-03', '2026-08-07', '2026-08-05')).toBe(40)
  })

  it('fără nicio oră pontată, estimarea rămâne consumul', () => {
    expect(forecastHours(0, [], '2026-08-03', '2026-08-07', '2026-08-05')).toBe(0)
  })
})

describe('weekStart / byWeek', () => {
  it('lunea săptămânii', () => {
    expect(weekStart('2026-08-05')).toBe('2026-08-03') // miercuri → luni
    expect(weekStart('2026-08-09')).toBe('2026-08-03') // duminică → lunea dinainte
  })

  it('adună orele pe săptămâni', () => {
    const out = byWeek([
      { work_date: '2026-08-05', hours: 8 },
      { work_date: '2026-08-07', hours: 16 },
      { work_date: '2026-08-10', hours: 4 },
    ])
    expect(out).toEqual([
      { week: '2026-08-03', hours: 24 },
      { week: '2026-08-10', hours: 4 },
    ])
  })
})
