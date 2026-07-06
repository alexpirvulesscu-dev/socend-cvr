// Design tokens — sursa: Socend CVR App.dc.html (Claude Design) + .claude/CLAUDE.md
// Estetică: Apple-like, carduri albe fără border pe fundal cald, umbre difuze,
// colțuri 16–20px, cifre tabulare, niciodată negru pur.

export const colors = {
  // Suprafețe
  bg: '#FAF9F6', // fundalul întregii aplicații (alb cald, nu alb pur)
  card: '#FFFFFF', // carduri albe, fără border vizibil
  border: '#E8E8E8', // separatoare discrete, unde chiar e nevoie

  // Navy închis — DOAR pe header-ul de zi din Șantier
  dark: '#0D1A2D',
  darkAlt: '#14263F',
  // Galben de accent — DOAR pe header-ul de zi din Șantier
  santierAccent: '#E2E04A',

  // Text
  text: '#0D1A2D', // text principal (navy închis, nu negru pur)
  textMuted: '#5B6673', // text secundar / etichete

  // Brand / acțiuni
  primary: '#58A834', // verde Socend — butoane primare, progres
  primaryHover: '#46862A',
  primaryTint: '#DDEDDC', // fundal deschis pentru chip-uri / evidențieri verzi
  link: '#115468',

  // Semantice (culorile KPI)
  success: '#58A834',
  warning: '#F0A800',
  error: '#D64545',
} as const

export const radius = {
  card: '20px', // carduri mari (Proiecte, KPI)
  panel: '16px', // panouri interioare, formulare
  pill: '9999px', // pastile de status și chip-uri
} as const

export const shadow = {
  // Umbre difuze, foarte soft — cardurile "plutesc" pe fundal
  card: '0 1px 2px rgba(13, 26, 45, 0.04), 0 8px 24px rgba(13, 26, 45, 0.06)',
  raised: '0 2px 4px rgba(13, 26, 45, 0.06), 0 12px 32px rgba(13, 26, 45, 0.10)',
} as const

export const font = {
  family:
    'Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
  // Cifre tabulare: toate numerele se aliniază vertical
  numeric: 'tabular-nums',
} as const

// Bara de sus: translucidă, cu efect de sticlă mată (frosted)
export const topBar = {
  background: 'rgba(250, 249, 246, 0.8)',
  backdropFilter: 'blur(20px)',
} as const

// Pragurile de culoare ale KPI-urilor (vezi formulele din .claude/CLAUDE.md)
export const kpiThresholds = {
  scheduleDays: { good: 2, warning: 7 }, // < 2 zile bine, 2–7 atenție, > 7 problemă
  margin: { good: 0.15, warning: 0.08 }, // ≥ 15% bine, 8–15% atenție, sub 8% problemă
  cash: { good: 0.9, warning: 0.7 }, // ≥ 90% bine, 70–90% atenție, sub 70% problemă
} as const
