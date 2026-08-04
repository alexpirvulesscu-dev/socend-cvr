// Matematica pură a Gantt-ului: dată ↔ pixel, pe INDICI DE ZI, nu pe milisecunde
// brute. Datele ISO (yyyy-mm-dd) se parsează ca miezul nopții UTC, deci trecerea
// la ora de vară (România EET/EEST) nu poate deplasa barele — fiecare zi e exact
// 86.400.000 ms în UTC. Totul e pur și testat în ganttScale.test.ts.

export const MS_DAY = 86_400_000

/** Nivelurile de zoom: lățimea unei zile, în pixeli. */
export const ZOOM_LEVELS = {
  saptamana: 36,
  luna: 12,
  trimestru: 4,
} as const
export type ZoomLevel = keyof typeof ZOOM_LEVELS

/** Diferența în zile întregi între două date ISO (b − a). */
export function daysBetween(aIso: string, bIso: string): number {
  return Math.round((Date.parse(bIso) - Date.parse(aIso)) / MS_DAY)
}

/** Data ISO la n zile după data dată (n poate fi negativ). */
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * MS_DAY).toISOString().slice(0, 10)
}

/** Indexul zilei față de începutul graficului (ziua 0 = chartStart). */
export function dayIndex(chartStart: string, iso: string): number {
  return daysBetween(chartStart, iso)
}

/** Poziția x (px) a începutului unei zile. */
export function dateToX(chartStart: string, iso: string, dayWidth: number): number {
  return dayIndex(chartStart, iso) * dayWidth
}

/**
 * Geometria unei bare: de la startul zilei de început până la SFÂRȘITUL zilei
 * de final (interval inclusiv — o bară de o singură zi are lățimea unei zile).
 */
export function barGeometry(
  chartStart: string,
  startIso: string,
  endIso: string,
  dayWidth: number
): { left: number; width: number } {
  const s = dayIndex(chartStart, startIso)
  const e = dayIndex(chartStart, endIso)
  return { left: s * dayWidth, width: (e - s + 1) * dayWidth }
}

/** Deplasarea în pixeli → delta în zile întregi (cu „snap" pe zi). */
export function pxToDeltaDays(dx: number, dayWidth: number): number {
  return Math.round(dx / dayWidth)
}

/** Ziua săptămânii pentru o dată ISO: 0 = luni … 6 = duminică. */
export function weekdayIndex(iso: string): number {
  // getUTCDay: 0 = duminică; convertim la 0 = luni
  return (new Date(Date.parse(iso)).getUTCDay() + 6) % 7
}

/** Cea mai apropiată zi de LUNI la sau înainte de data dată. */
export function mondayOnOrBefore(iso: string): string {
  return addDays(iso, -weekdayIndex(iso))
}

/**
 * Fereastra graficului: acoperă toate barele + ziua de azi, împinsă la
 * granițe de luni (săptămâni întregi) cu o săptămână de aer în fiecare parte.
 */
export function chartRange(
  dates: string[],
  today: string
): { start: string; end: string; days: number } {
  const all = [...dates, today].filter(Boolean)
  let min = all[0]
  let max = all[0]
  for (const d of all) {
    if (d < min) min = d
    if (d > max) max = d
  }
  const start = addDays(mondayOnOrBefore(min), -7)
  // capătul: duminica săptămânii lui max, plus o săptămână
  const end = addDays(mondayOnOrBefore(max), 6 + 7)
  return { start, end, days: daysBetween(start, end) + 1 }
}

export interface MonthSegment {
  /** eticheta „iul. 2026" */
  label: string
  /** indexul zilei de început (față de chartStart) */
  startIdx: number
  /** câte zile are segmentul în fereastră */
  days: number
}

const MONTH_NAMES = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.']

/** Segmentele de lună din fereastră, pentru banda de sus a axei de timp. */
export function monthSegments(chartStart: string, totalDays: number): MonthSegment[] {
  const out: MonthSegment[] = []
  let i = 0
  while (i < totalDays) {
    const d = new Date(Date.parse(addDays(chartStart, i)))
    const month = d.getUTCMonth()
    const year = d.getUTCFullYear()
    // până la finalul lunii curente sau al ferestrei
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const dayOfMonth = d.getUTCDate()
    const remaining = Math.min(daysInMonth - dayOfMonth + 1, totalDays - i)
    out.push({ label: `${MONTH_NAMES[month]} ${year}`, startIdx: i, days: remaining })
    i += remaining
  }
  return out
}
