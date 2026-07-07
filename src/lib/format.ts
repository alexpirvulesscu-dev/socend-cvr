// Formatarea numerelor în format românesc — UNICUL loc din aplicație unde
// se formatează numere (cerință QA faza 7): 2.482.395 lei · 35,4% · 3,6 zile

const nf0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** 2482395 → „2.482.395" */
export function num(n: number, decimals: 0 | 1 = 0): string {
  return (decimals === 0 ? nf0 : nf1).format(n)
}

/** 2482395 → „2.482.395 lei" */
export function lei(n: number): string {
  return `${nf0.format(n)} lei`
}

/** 0.354 → „35,4%" */
export function pct(fraction: number, decimals: 0 | 1 = 1): string {
  return `${num(fraction * 100, decimals)}%`
}

/**
 * Format compact ca în design: 1.580.000 → „1,58M" · 402.000 → „402k" · 5.200 → „5.200".
 * Semnul se păstrează („+11k" se obține cu prefix la apelare).
 */
export function compact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) {
    const v = new Intl.NumberFormat('ro-RO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs / 1_000_000)
    return `${sign}${v}M`
  }
  if (abs >= 10_000) return `${sign}${nf0.format(Math.round(abs / 1000))}k`
  return `${sign}${nf0.format(abs)}`
}

/** 3.58 → „3,6 zile" (o zecimală) */
export function zile(n: number): string {
  const abs = Math.abs(n)
  const val = nf1.format(abs)
  return abs === 1 ? `${val} zi` : `${val} zile`
}

/** „2026-07-06" → „6 iul. 2026" */
export function dataRo(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Ziua de azi, pentru header-ul de șantier: „Luni, 6 iulie" */
export function ziuaDeAzi(): string {
  const s = new Date().toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
