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

/**
 * Parsează un număr tastat în format românesc (SINGURUL parser din aplicație —
 * înlocuiește copiile divergente din modals/Configurare, dintre care una citea
 * „2.500" ca 2,5).
 *  - „2.500" → 2500 · „1.234.567" → 1234567 (punct = separator de mii)
 *  - „35,4" → 35.4 · „2.500,75" → 2500.75 (virgulă = zecimală)
 *  - „2.5" → 2.5 (un singur punct care NU e urmat de exact 3 cifre = zecimală
 *    tastată în stil englezesc — o acceptăm ca să nu pedepsim obiceiul)
 * Gol sau invalid → 0.
 */
export function toNum(s: string): number {
  let t = s.trim().replace(/\s/g, '')
  if (!t) return 0
  if (t.includes(',')) {
    // format românesc complet: mii cu punct, zecimale cu virgulă
    t = t.replace(/\./g, '').replace(',', '.')
  } else {
    const dots = t.match(/\./g)?.length ?? 0
    if (!(dots === 1 && !/\.\d{3}$/.test(t))) {
      // toate punctele sunt separatori de mii („2.500", „1.234.567")
      t = t.replace(/\./g, '')
    }
    // altfel: un singur punct ne-urmat de exact 3 cifre → zecimală, rămâne
  }
  const v = Number(t)
  return Number.isFinite(v) ? v : 0
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
