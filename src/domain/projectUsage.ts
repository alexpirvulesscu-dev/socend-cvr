// Ce are un proiect înainte să fie șters (brief 59, regula Anei din 12 nov 2026).
//
// CVR, P&L și HR (Pontaj) rămân legate: un proiect șters din CVR dispare și din
// P&L și din HR. De aceea, înainte de ștergere, baza de date numără ce are
// proiectul (funcția `cvr_project_usage`, doar numere, fără sume sau nume):
//  - în P&L: plăți și încasări pe numele lui (inclusiv părți din plăți împărțite
//    pe proiecte), contracte, reguli de cash-flow;
//  - în HR: zile pontate (și cele șterse în HR, care tot blochează ștergerea),
//    alocări de oameni, alocări de vehicule.
// Dacă are ceva, CVR-ul NU șterge: propune „Închide proiectul" (istoria rămâne).
// Fișierul e pur (fără Supabase), ca să poată fi testat.
import { num } from '../lib/format'

/** Numerele întoarse de `cvr_project_usage(p_project_id)`. */
export interface ProjectUsage {
  plati: number
  plati_impartite: number
  incasari: number
  contracte: number
  reguli: number
  pontaj_zile: number
  pontaj_zile_sterse: number
  pontaj_alocari: number
  pontaj_vehicule: number
}

/** Câmpurile, în ordinea în care apar în fereastră, cu forma de singular / plural. */
const LABELS: { key: keyof ProjectUsage; one: string; many: string; where: 'P&L' | 'HR' }[] = [
  { key: 'plati', one: 'plată', many: 'plăți', where: 'P&L' },
  { key: 'plati_impartite', one: 'plată împărțită pe proiecte care îl include', many: 'plăți împărțite pe proiecte care îl includ', where: 'P&L' },
  { key: 'incasari', one: 'încasare', many: 'încasări', where: 'P&L' },
  { key: 'contracte', one: 'contract', many: 'contracte', where: 'P&L' },
  { key: 'reguli', one: 'regulă de cash-flow', many: 'reguli de cash-flow', where: 'P&L' },
  { key: 'pontaj_zile', one: 'zi pontată', many: 'zile pontate', where: 'HR' },
  { key: 'pontaj_zile_sterse', one: 'zi pontată ștearsă în HR (rămâne în istoric)', many: 'zile pontate șterse în HR (rămân în istoric)', where: 'HR' },
  { key: 'pontaj_alocari', one: 'alocare de oameni', many: 'alocări de oameni', where: 'HR' },
  { key: 'pontaj_vehicule', one: 'alocare de vehicul', many: 'alocări de vehicule', where: 'HR' },
]

/** Româna pune „de" între număr și substantiv de la 20 în sus (20 de plăți, 101 plăți, 120 de plăți). */
export function countRo(n: number, one: string, many: string): string {
  if (n === 1) return `1 ${one}`
  const rest = n % 100
  const de = n >= 20 && (rest === 0 || rest >= 20)
  return `${num(n)} ${de ? 'de ' : ''}${many}`
}

/** Transformă orice răspuns (lipsă, text, null) într-un număr întreg ≥ 0. */
function n0(v: unknown): number {
  const x = Number(v)
  return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0
}

/** Citește răspunsul bazei de date fără să se bazeze pe forma lui exactă (un câmp lipsă = 0). */
export function parseUsage(raw: unknown): ProjectUsage {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = {} as ProjectUsage
  for (const { key } of LABELS) out[key] = n0(o[key])
  return out
}

/** Are proiectul ceva în P&L sau în HR? Atunci nu se șterge, se închide. */
export function hasUsage(u: ProjectUsage): boolean {
  return LABELS.some(({ key }) => u[key] > 0)
}

/** Rândurile ferestrei, grupate pe aplicație: „P&L: 23 de plăți, 1 plată împărțită..." */
export function usageLines(u: ProjectUsage): { where: 'P&L' | 'HR'; items: string[] }[] {
  const groups: { where: 'P&L' | 'HR'; items: string[] }[] = []
  for (const where of ['P&L', 'HR'] as const) {
    const items = LABELS.filter((l) => l.where === where && u[l.key] > 0).map((l) =>
      countRo(u[l.key], l.one, l.many)
    )
    if (items.length) groups.push({ where, items })
  }
  return groups
}
