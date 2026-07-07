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
