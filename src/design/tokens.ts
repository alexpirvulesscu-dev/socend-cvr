// Oglinda în JavaScript a tokenilor din src/index.css.
// O folosesc DOAR locurile care au nevoie de valoarea culorii ca șir (SVG,
// canvas, stiluri inline calculate) — restul aplicației folosește utilitarele
// Tailwind generate din @theme (bg-paper-1, text-ink-2, ...).
// Dacă schimbi ceva aici, schimbă și în index.css. Nicăieri altundeva nu se
// scrie un hex.

export const color = {
  paper2: '#F6F5EF',
  paper1: '#FBFAF5',
  paper0: '#FFFFFF',

  line1: '#F0EFE8',
  line2: '#E5E4DA',
  line3: '#D8D7CC',

  ink1: '#16181C',
  ink2: '#43463F',
  ink3: '#6B6E63',
  ink4: '#9C9E92',

  accent: '#157A55',
  accentHover: '#116A4A',
  accentActive: '#0E5A3F',
  accentInk: '#0F5C41',
  accentSoft: '#EAF2EC',
  focusRing: 'rgba(21,122,85,.45)',

  pos: '#178A50',
  posFill: '#2E9E6B',
  posBg: '#E7F2EA',
  posPill: '#146C43',

  warn: '#A8720F',
  warnFill: '#E0A63B',
  warnBg: '#FBF1DC',
  warnPill: '#96660B',
  warnSoft: '#EFCF8C',

  neg: '#C2413B',
  negFill: '#D65B4F',
  negBg: '#FBE9E7',
  negPill: '#B03A2E',

  info: '#2C5A82',
  infoFill: '#4C8FD6',
  infoBg: '#E9F0F6',

  chartInk: '#43463F',
  cat1: '#2E9E6B',
  cat2: '#47698F',
  cat3: '#5FA8A0',
  cat4: '#D9A441',
  cat5: '#A8AA9C',
  grid: '#F2F1EA',

  track: '#EEEDE5',
  tick: '#ACAEA1',
  progressNeutral: '#8FBCA3',
  segment: '#EFEEE6',
  scrim: 'rgba(22,24,28,.35)',
} as const

/** Ordinea și culorile categoriilor de cost — aceleași peste tot. */
export const CATEGORY_COLOR = {
  materiale: color.cat1,
  manopera: color.cat2,
  subcontractori: color.cat3,
  utilaje: color.cat4,
  organizare: color.cat5,
} as const

/** Pragurile de culoare ale KPI-urilor (formulele sunt în .claude/CLAUDE.md). */
export const kpiThresholds = {
  scheduleDays: { good: 2, warning: 7 }, // sub 2 zile bine, 2–7 atenție, peste 7 problemă
  margin: { good: 0.15, warning: 0.08 }, // ≥ 15% bine, 8–15% atenție, sub 8% problemă
  cash: { good: 0.9, warning: 0.7 }, // ≥ 90% bine, 70–90% atenție, sub 70% problemă
} as const
