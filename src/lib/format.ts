// Formatarea numerelor — UNICUL loc din aplicație unde se formatează un număr.
// Reguli (Clean Ledger, adaptate la română și la lei):
//  - tabele și orice verifică un contabil: numărul întreg, cu separatori →
//    „2.482.395 lei"
//  - cifre mari pe carduri: „2,48M lei" de la un milion în sus (două zecimale),
//    „431k lei" sub un milion (fără zecimale)
//  - procentele au ÎNTOTDEAUNA o zecimală: „4,0%", niciodată „4%"
//  - minusul e minusul adevărat „−" (U+2212), nu cratima
//  - valoarea lipsă se scrie „–" (linie de dialog), niciodată gol

const nf0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Cratima produsă de Intl devine minusul tipografic. */
function trueMinus(s: string): string {
  return s.replace(/^-/, '−')
}

/** Valoarea lipsă, peste tot la fel. */
export const DASH = '–'

/** 2482395 → „2.482.395" (minus adevărat la negative) */
export function num(n: number, decimals: 0 | 1 | 2 = 0): string {
  const f = decimals === 0 ? nf0 : decimals === 1 ? nf1 : nf2
  return trueMinus(f.format(n))
}

/** 2482395 → „2.482.395 lei" — forma de tabel, numărul întreg */
export function lei(n: number): string {
  return `${num(n)} lei`
}

/** 0.354 → „35,4%" · o zecimală întotdeauna */
export function pct(fraction: number): string {
  return `${num(fraction * 100, 1)}%`
}

/** +0.057 → „+5,7 pt" · diferența față de plan, cu semn */
export function puncte(points: number): string {
  return `${points >= 0 ? '+' : ''}${num(points, 1)} pt`
}

/**
 * Forma scurtă pentru cifrele mari: 2.482.395 → „2,48M" · 431.000 → „431k" ·
 * 5.200 → „5.200". Semnul minus se păstrează; „+" se pune la apelare.
 *
 * Pragul de mii e 10.000, nu 1.000 (abatere conștientă de la sistemul de
 * design): în lei, sumele de patru cifre sunt curente, iar „5k" în loc de
 * „5.200" pierde exact precizia pe care omul o caută. Peste 10.000 rotunjirea
 * nu mai schimbă decizia.
 */
export function compact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}${nf2.format(abs / 1_000_000)}M`
  if (abs >= 10_000) return `${sign}${nf0.format(Math.round(abs / 1000))}k`
  return `${sign}${nf0.format(abs)}`
}

/** 2482395 → „2,48M lei" — forma scurtă cu moneda */
export function compactLei(n: number): string {
  return `${compact(n)} lei`
}

/** 3.58 → „3,6 zile"; zilele întregi rămân întregi: 7 → „7 zile" */
export function zile(n: number): string {
  const abs = Math.abs(n)
  const val = Number.isInteger(abs) ? nf0.format(abs) : nf1.format(abs)
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

/** „2026-07-06" → „6 iul." — pentru tabele strâmte, unde anul se subînțelege */
export function dataScurt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'short',
  })
}

/** „2026-07-06" → „iul." — eticheta de lună din Gantt */
export function lunaScurt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ro-RO', { month: 'short' })
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
  let t = s.trim().replace(/\s/g, '').replace(/−/g, '-')
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
