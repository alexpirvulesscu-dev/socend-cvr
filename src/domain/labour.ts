// Manopera în ore: planul, consumul și comparația zi cu zi.
//
// Funcții pure — nu ating baza de date, ca să poată fi testate direct.
// Regula de aur (cerută de Alex): orele se numără la nivelul la care au fost
// repartizate și se adună mereu în sus. Nimic aici nu depinde de livrabile sau
// de progresul fizic; se compară ore cu ore.

/** Planul de ore al unui nivel: fie declarat, fie însumat din copii. */
export interface PlanNode {
  /** ore declarate explicit pe acest nivel (null = nedeclarat) */
  declared: number | null
  /** planul copiilor, deja rezolvat */
  children: number[]
}

/**
 * Planul efectiv al unui nivel: numărul declarat bate suma copiilor.
 * Fără nimic declarat și fără copii, planul e 0 (nu null) — un proiect fără
 * plan e un proiect cu plan zero, iar comparația spune exact asta.
 */
export function plannedHours(node: PlanNode): number {
  if (node.declared !== null && node.declared > 0) return node.declared
  return node.children.reduce((s, n) => s + n, 0)
}

/** Verdictul comparației plan vs consumat. */
export type LabourVerdict = 'fara_plan' | 'sub_plan' | 'aproape' | 'peste_plan'

/**
 * Cât din planul de ore s-a consumat. Pragurile: până la 90% e confortabil,
 * 90–100% e „aproape", peste 100% e depășire.
 */
export function labourVerdict(planned: number, spent: number): LabourVerdict {
  if (planned <= 0) return 'fara_plan'
  const pct = spent / planned
  if (pct > 1) return 'peste_plan'
  if (pct >= 0.9) return 'aproape'
  return 'sub_plan'
}

/** Orele rămase din plan. Negativ = depășire. */
export function hoursLeft(planned: number, spent: number): number {
  return planned - spent
}

/**
 * Ritmul mediu, în ore pe zi lucrată. Se împarte la zilele în care s-a pontat
 * ceva, nu la zilele de calendar — altfel weekendurile diluează ritmul.
 */
export function averagePerDay(days: { hours: number }[]): number {
  const worked = days.filter((d) => d.hours > 0)
  if (worked.length === 0) return 0
  return worked.reduce((s, d) => s + d.hours, 0) / worked.length
}

/**
 * Estimarea la final: dacă se ține ritmul de până acum, câte ore ies în total?
 * Fără o fereastră de plan (start/end) nu se poate estima, deci null.
 */
export function forecastHours(
  spent: number,
  days: { work_date: string; hours: number }[],
  start: string | null,
  end: string | null,
  today: string
): number | null {
  if (!start || !end) return null
  const rate = averagePerDay(days)
  if (rate <= 0) return spent
  const remaining = workingDaysBetween(maxDate(today, start), end)
  return Math.round(spent + rate * remaining)
}

/** Zilele lucrătoare (luni–vineri) dintre două date, inclusiv capetele. */
export function workingDaysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`)
  const b = new Date(`${to}T00:00:00Z`)
  if (b < a) return 0
  let n = 0
  for (const d = new Date(a); d <= b; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay()
    if (day !== 0 && day !== 6) n++
  }
  return n
}

function maxDate(a: string, b: string): string {
  return a > b ? a : b
}

/** Un punct pe curba zilnică: cât s-a consumat și cât ar fi trebuit. */
export interface LabourPoint {
  date: string
  /** orele pontate în ziua respectivă */
  hours: number
  /** cumulat consumat până la data asta, inclusiv */
  cumulative: number
  /** cumulat planificat până la data asta (linia dreaptă a planului) */
  plannedCumulative: number | null
}

/**
 * Curba zi cu zi: consumul cumulat, cu linia planului alături.
 *
 * Planul se întinde liniar peste zilele LUCRĂTOARE dintre start și sfârșit —
 * aceeași regulă ca `plan_pct` din KPI-uri, ca cele două ecrane să nu spună
 * lucruri diferite. Fără fereastră de plan sau fără ore planificate, linia
 * planului lipsește (null) și rămâne doar consumul.
 */
export function labourCurve(
  days: { work_date: string; hours: number }[],
  planned: number,
  start: string | null,
  end: string | null
): LabourPoint[] {
  const sorted = [...days].sort((a, b) => a.work_date.localeCompare(b.work_date))
  const totalWorking = start && end ? workingDaysBetween(start, end) : 0
  const perWorkingDay = totalWorking > 0 && planned > 0 ? planned / totalWorking : null

  let cumulative = 0
  return sorted.map((d) => {
    cumulative += d.hours
    let plannedCumulative: number | null = null
    if (perWorkingDay !== null && start) {
      const elapsed = workingDaysBetween(start, maxDate(d.work_date, start))
      plannedCumulative = Math.min(Math.round(perWorkingDay * elapsed), planned)
    }
    return { date: d.work_date, hours: d.hours, cumulative, plannedCumulative }
  })
}

/** Grupează zilele pe săptămâni ISO, pentru citirea pe termen lung. */
export function byWeek(days: { work_date: string; hours: number }[]): {
  week: string
  hours: number
}[] {
  const map = new Map<string, number>()
  for (const d of days) {
    const key = weekStart(d.work_date)
    map.set(key, (map.get(key) ?? 0) + d.hours)
  }
  return [...map.entries()]
    .map(([week, hours]) => ({ week, hours }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

/** Lunea săptămânii în care cade data. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = d.getUTCDay()
  const back = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - back)
  return d.toISOString().slice(0, 10)
}
