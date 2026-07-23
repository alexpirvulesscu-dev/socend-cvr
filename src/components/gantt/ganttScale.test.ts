// Testele matematicii Gantt — inclusiv trecerea la ora de vară din România
// (29 martie 2026), care NU are voie să deplaseze barele.
import { describe, expect, it } from 'vitest'
import {
  addDays,
  barGeometry,
  chartRange,
  dayIndex,
  daysBetween,
  mondayOnOrBefore,
  monthSegments,
  pxToDeltaDays,
  weekdayIndex,
} from './ganttScale'

describe('daysBetween / addDays', () => {
  it('diferență simplă de zile', () => {
    expect(daysBetween('2026-07-01', '2026-07-10')).toBe(9)
    expect(daysBetween('2026-07-10', '2026-07-01')).toBe(-9)
  })
  it('addDays înainte și înapoi', () => {
    expect(addDays('2026-07-01', 9)).toBe('2026-07-10')
    expect(addDays('2026-07-01', -1)).toBe('2026-06-30')
  })
  it('peste trecerea la ora de vară (29 mar. 2026) — exact o zi pe zi', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
  })
  it('peste treceri de an', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
  })
})

describe('geometria barelor', () => {
  it('bara de o zi are lățimea unei zile (interval inclusiv)', () => {
    const g = barGeometry('2026-07-01', '2026-07-05', '2026-07-05', 12)
    expect(g.left).toBe(4 * 12)
    expect(g.width).toBe(12)
  })
  it('bara de 10 zile', () => {
    const g = barGeometry('2026-07-01', '2026-07-01', '2026-07-10', 36)
    expect(g.left).toBe(0)
    expect(g.width).toBe(10 * 36)
  })
  it('dayIndex 0 pentru chartStart', () => {
    expect(dayIndex('2026-07-01', '2026-07-01')).toBe(0)
  })
})

describe('pxToDeltaDays (snap pe zi)', () => {
  it('rotunjește la cea mai apropiată zi', () => {
    expect(pxToDeltaDays(5, 12)).toBe(0)
    expect(pxToDeltaDays(7, 12)).toBe(1)
    expect(pxToDeltaDays(-19, 12)).toBe(-2)
  })
})

describe('săptămâni', () => {
  it('weekdayIndex: luni = 0, duminică = 6', () => {
    expect(weekdayIndex('2026-07-20')).toBe(0) // luni
    expect(weekdayIndex('2026-07-26')).toBe(6) // duminică
  })
  it('mondayOnOrBefore', () => {
    expect(mondayOnOrBefore('2026-07-23')).toBe('2026-07-20') // joi → luni
    expect(mondayOnOrBefore('2026-07-20')).toBe('2026-07-20') // luni → ea însăși
  })
})

describe('chartRange', () => {
  it('acoperă toate datele + azi, pe granițe de luni, cu o săptămână de aer', () => {
    const r = chartRange(['2026-07-06', '2026-08-28'], '2026-07-23')
    expect(weekdayIndex(r.start)).toBe(0) // începe luni
    expect(r.start <= '2026-07-06').toBe(true)
    expect(r.end >= '2026-08-28').toBe(true)
    expect(daysBetween('2026-07-06', r.start)).toBeLessThanOrEqual(-7) // aer ≥ o săptămână
    expect(r.days).toBe(daysBetween(r.start, r.end) + 1)
    expect(r.days % 7).toBe(0) // săptămâni întregi
  })
  it('azi în afara barelor extinde fereastra', () => {
    const r = chartRange(['2026-07-06', '2026-07-10'], '2026-09-15')
    expect(r.end >= '2026-09-15').toBe(true)
  })
})

describe('monthSegments', () => {
  it('împarte fereastra pe luni, cu etichete românești', () => {
    const segs = monthSegments('2026-06-29', 35) // 29 iun. – 2 aug.
    expect(segs[0].label).toBe('iun. 2026')
    expect(segs[0].days).toBe(2) // 29–30 iunie
    expect(segs[1].label).toBe('iul. 2026')
    expect(segs[1].days).toBe(31)
    expect(segs[2].label).toBe('aug. 2026')
    expect(segs[2].days).toBe(2)
    const total = segs.reduce((s, m) => s + m.days, 0)
    expect(total).toBe(35)
  })
})
