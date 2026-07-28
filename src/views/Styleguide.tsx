// Styleguide — pagina internă cerută de sistemul Clean Ledger (DESIGN.md, „Gata
// înseamnă", punctul 7). Arată tokenii, scara de text, formatarea cifrelor și
// fiecare piesă din src/components/ui.tsx în toate stările ei.
// Reguli respectate aici, ca peste tot: niciun hex scris de mână (valorile vin
// din src/design/tokens.ts), niciun număr formatat în afara src/lib/format.ts.
// Pagina nu atinge Supabase — toate datele de mai jos sunt inventate.
import { useState, type ReactNode } from 'react'
import { PageHeader } from '../components/Shell'
import { color } from '../design/tokens'
import { DASH, compact, dataRo, dataScurt, lei, num, pct, puncte, zile } from '../lib/format'
import {
  BackLink,
  Card,
  DangerButton,
  EmptyState,
  ErrorStrip,
  GhostButton,
  KpiPill,
  MarginRail,
  NeutralPill,
  Pill,
  PrimaryButton,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  StatCard,
  StatCardSkeleton,
  StatusPill,
  TableFooter,
  TableHead,
  TableRow,
  WhatIfStrip,
} from '../components/ui'

// ── Ajutoare locale ──────────────────────────────────────────────────────

/** Eticheta unui sub-grup dintr-o secțiune (aceeași formă ca antetul de tabel). */
function Eticheta({ children }: { children: ReactNode }) {
  return (
    <p className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">{children}</p>
  )
}

/** Un exemplu: etichetă, piesele una lângă alta, eventual o notă dedesubt. */
function Exemplu({
  eticheta,
  nota,
  children,
}: {
  eticheta: string
  nota?: string
  children: ReactNode
}) {
  return (
    <div>
      <Eticheta>{eticheta}</Eticheta>
      <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
      {nota && <p className="mt-2 text-sub text-ink-3">{nota}</p>}
    </div>
  )
}

/**
 * Tabelele stau lipite de marginile cardului, ca în restul aplicației, și
 * derulează orizontal pe ecran îngust. `minWidth` e o clasă literală (min-w-[…]).
 */
function TabelInCard({ children, minWidth }: { children: ReactNode; minWidth: string }) {
  return (
    <div className="-mx-5 -mb-5 mt-3 overflow-hidden rounded-b-card border-t border-line-1">
      <div className="overflow-x-auto">
        <div className={minWidth}>{children}</div>
      </div>
    </div>
  )
}

// ── 1. Tokenii de culoare ────────────────────────────────────────────────
// Clasele sunt scrise întregi, ca șiruri literale, ca să le vadă scanerul
// Tailwind (o clasă compusă în timpul rulării nu ar fi generată).

interface Token {
  nume: string
  cls: string
  val: string
}

const GRUPURI: { grup: string; sens: string; tokeni: Token[] }[] = [
  {
    grup: 'Suprafețe',
    sens: 'paper-2 e fundalul aplicației, paper-1 benzile discrete, paper-0 cardurile.',
    tokeni: [
      { nume: 'paper-2', cls: 'bg-paper-2', val: color.paper2 },
      { nume: 'paper-1', cls: 'bg-paper-1', val: color.paper1 },
      { nume: 'paper-0', cls: 'bg-paper-0', val: color.paper0 },
    ],
  },
  {
    grup: 'Linii',
    sens: 'line-1 desparte rândurile, line-2 conturează cardurile, line-3 e conturul tare.',
    tokeni: [
      { nume: 'line-1', cls: 'bg-line-1', val: color.line1 },
      { nume: 'line-2', cls: 'bg-line-2', val: color.line2 },
      { nume: 'line-3', cls: 'bg-line-3', val: color.line3 },
    ],
  },
  {
    grup: 'Text',
    sens: 'Textul cu informație stă între ink-1 și ink-3. ink-4 e doar decor.',
    tokeni: [
      { nume: 'ink-1', cls: 'bg-ink-1', val: color.ink1 },
      { nume: 'ink-2', cls: 'bg-ink-2', val: color.ink2 },
      { nume: 'ink-3', cls: 'bg-ink-3', val: color.ink3 },
      { nume: 'ink-4', cls: 'bg-ink-4', val: color.ink4 },
    ],
  },
  {
    grup: 'Accent',
    sens: 'Singura culoare de brand: acțiunea principală și elementul activ.',
    tokeni: [
      { nume: 'accent', cls: 'bg-accent', val: color.accent },
      { nume: 'accent-hover', cls: 'bg-accent-hover', val: color.accentHover },
      { nume: 'accent-active', cls: 'bg-accent-active', val: color.accentActive },
      { nume: 'accent-ink', cls: 'bg-accent-ink', val: color.accentInk },
      { nume: 'accent-soft', cls: 'bg-accent-soft', val: color.accentSoft },
      { nume: 'focus-ring', cls: 'bg-focus-ring', val: color.focusRing },
    ],
  },
  {
    grup: 'Pozitiv',
    sens: 'Bani câștigați, aprobat, conform planului.',
    tokeni: [
      { nume: 'pos', cls: 'bg-pos', val: color.pos },
      { nume: 'pos-fill', cls: 'bg-pos-fill', val: color.posFill },
      { nume: 'pos-bg', cls: 'bg-pos-bg', val: color.posBg },
      { nume: 'pos-pill', cls: 'bg-pos-pill', val: color.posPill },
    ],
  },
  {
    grup: 'Atenție',
    sens: 'În așteptare, de urmărit, în urmă.',
    tokeni: [
      { nume: 'warn', cls: 'bg-warn', val: color.warn },
      { nume: 'warn-fill', cls: 'bg-warn-fill', val: color.warnFill },
      { nume: 'warn-bg', cls: 'bg-warn-bg', val: color.warnBg },
      { nume: 'warn-pill', cls: 'bg-warn-pill', val: color.warnPill },
      { nume: 'warn-soft', cls: 'bg-warn-soft', val: color.warnSoft },
    ],
  },
  {
    grup: 'Negativ',
    sens: 'Pierdem bani, respins, depășit.',
    tokeni: [
      { nume: 'neg', cls: 'bg-neg', val: color.neg },
      { nume: 'neg-fill', cls: 'bg-neg-fill', val: color.negFill },
      { nume: 'neg-bg', cls: 'bg-neg-bg', val: color.negBg },
      { nume: 'neg-pill', cls: 'bg-neg-pill', val: color.negPill },
    ],
  },
  {
    grup: 'Informativ',
    sens: 'Context fără verdict — reperul de plan, notele explicative.',
    tokeni: [
      { nume: 'info', cls: 'bg-info', val: color.info },
      { nume: 'info-fill', cls: 'bg-info-fill', val: color.infoFill },
      { nume: 'info-bg', cls: 'bg-info-bg', val: color.infoBg },
    ],
  },
  {
    grup: 'Grafice',
    sens: 'Ordinea categoriilor nu se schimbă: 1 Materiale, 2 Manoperă, 3 Subcontractori, 4 Utilaje, 5 Organizare.',
    tokeni: [
      { nume: 'chart-ink', cls: 'bg-chart-ink', val: color.chartInk },
      { nume: 'cat-1', cls: 'bg-cat-1', val: color.cat1 },
      { nume: 'cat-2', cls: 'bg-cat-2', val: color.cat2 },
      { nume: 'cat-3', cls: 'bg-cat-3', val: color.cat3 },
      { nume: 'cat-4', cls: 'bg-cat-4', val: color.cat4 },
      { nume: 'cat-5', cls: 'bg-cat-5', val: color.cat5 },
      { nume: 'grid', cls: 'bg-grid', val: color.grid },
    ],
  },
  {
    grup: 'Controale',
    sens: 'Bara goală, reperul de plan, procentul fără verdict și fundalul segmentelor.',
    tokeni: [
      { nume: 'track', cls: 'bg-track', val: color.track },
      { nume: 'tick', cls: 'bg-tick', val: color.tick },
      { nume: 'progress-neutral', cls: 'bg-progress-neutral', val: color.progressNeutral },
      { nume: 'segment', cls: 'bg-segment', val: color.segment },
    ],
  },
]

// ── 2. Scara tipografică (rândurile din tabelul DESIGN.md) ───────────────

const SCARA: { rol: string; cls: string; greutate: string; mostra: ReactNode }[] = [
  {
    rol: 'titlu de pagină · serif',
    cls: 'text-[clamp(24px,2.2vw,31px)]',
    greutate: '400',
    // serif DOAR pe <h1>; elementul îl primește automat din stratul de bază
    mostra: <h1 className="text-[clamp(24px,2.2vw,31px)] leading-none text-ink-1">Titlu de pagină</h1>,
  },
  {
    rol: 'cifră mare',
    cls: 'text-stat',
    greutate: '700',
    mostra: (
      <p className="text-stat font-bold tracking-[-0.02em] tabular-nums text-ink-1">
        {compact(2482395)} lei
      </p>
    ),
  },
  {
    rol: 'cifră de detaliu',
    cls: 'text-stat-sm',
    greutate: '700',
    mostra: <p className="text-stat-sm font-bold tabular-nums text-ink-1">{pct(0.354)}</p>,
  },
  {
    rol: 'titlu de card',
    cls: 'text-card',
    greutate: '600',
    mostra: <p className="text-card font-semibold text-ink-1">Titlu de card</p>,
  },
  {
    rol: 'subtitlu de card',
    cls: 'text-sub · text-ink-3',
    greutate: '400',
    mostra: <p className="text-sub text-ink-3">O propoziție care explică datele</p>,
  },
  {
    rol: 'rând / celulă',
    cls: 'text-row',
    greutate: '500–600',
    mostra: <p className="text-row font-medium text-ink-1">Rând de tabel · celulă</p>,
  },
  {
    rol: 'element de navigație',
    cls: 'text-nav',
    greutate: '500–600',
    mostra: <p className="text-nav font-medium text-ink-2">Element de navigație</p>,
  },
  {
    rol: 'antet de tabel',
    cls: 'text-th · uppercase · tracking-[0.07em] · text-ink-3',
    greutate: '600',
    mostra: (
      <p className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
        Antet de tabel
      </p>
    ),
  },
  {
    rol: 'pastilă',
    cls: 'text-pill',
    greutate: '600',
    mostra: <p className="text-pill font-semibold text-ink-2">Pastilă</p>,
  },
  {
    rol: 'meta',
    cls: 'text-meta · text-ink-4',
    greutate: '500',
    mostra: <p className="text-meta font-medium text-ink-4">meta · actualizat acum 3 minute</p>,
  },
]

// ── 3. Formatarea cifrelor ───────────────────────────────────────────────

const CIFRE: { apel: string; rezultat: string }[] = [
  { apel: 'lei(2482395)', rezultat: lei(2482395) },
  { apel: 'lei(-18450)', rezultat: lei(-18450) },
  { apel: 'compact(2482395)', rezultat: compact(2482395) },
  { apel: 'compact(431000)', rezultat: compact(431000) },
  { apel: 'compact(-620)', rezultat: compact(-620) },
  { apel: 'pct(0.354)', rezultat: pct(0.354) },
  { apel: 'pct(-0.042)', rezultat: pct(-0.042) },
  { apel: 'puncte(5.7)', rezultat: puncte(5.7) },
  { apel: 'puncte(-1.2)', rezultat: puncte(-1.2) },
  { apel: 'num(1234567)', rezultat: num(1234567) },
  { apel: 'num(-1234.56, 2)', rezultat: num(-1234.56, 2) },
  { apel: 'zile(3.58)', rezultat: zile(3.58) },
  { apel: 'zile(1)', rezultat: zile(1) },
  { apel: "dataRo('2026-07-06')", rezultat: dataRo('2026-07-06') },
  { apel: "dataScurt('2026-07-06')", rezultat: dataScurt('2026-07-06') },
  { apel: 'DASH (valoare lipsă)', rezultat: DASH },
]

// ── 8. Rânduri inventate pentru tabel ────────────────────────────────────

const JOBURI = [
  { nume: 'Rețea termică · tronson A', done: 0.82, plan: 0.75, valoare: 1_284_000 },
  { nume: 'Cămine și armături', done: 0.41, plan: 0.6, valoare: 486_500 },
  { nume: 'Probe și punere în funcțiune', done: 0, plan: 0.1, valoare: 212_400 },
]
const TOTAL_JOBURI = JOBURI.reduce((s, j) => s + j.valoare, 0)

type Perioada = 'luna' | 'trimestru' | 'an'
const PERIOADE: { value: Perioada; label: string }[] = [
  { value: 'luna', label: 'Lună' },
  { value: 'trimestru', label: 'Trimestru' },
  { value: 'an', label: 'An' },
]

// ── Pagina ───────────────────────────────────────────────────────────────

export function StyleguideView({ onBack }: { onBack?: () => void }) {
  const [perioada, setPerioada] = useState<Perioada>('luna')
  const [ecou, setEcou] = useState('nimic încă')

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-10 pt-[72px] md:px-8 md:pt-6">
      <PageHeader
        title="Styleguide"
        pill="Clean Ledger"
        subtitle="Tokeni, scara de text și fiecare piesă în toate stările"
        back={onBack ? <BackLink label="Înapoi" onClick={onBack} /> : undefined}
      />

      <p className="mb-5 text-sub text-ink-3">
        Ultima acțiune: <span className="font-semibold text-ink-1">{ecou}</span>
      </p>

      <div className="space-y-5">
        {/* 1 ─ Culori */}
        <Card
          title="Culori"
          subtitle="Toți tokenii sistemului. Nimic din afara acestei liste nu are voie într-o componentă."
        >
          <div className="space-y-6">
            {GRUPURI.map((g) => (
              <div key={g.grup}>
                <Eticheta>{g.grup}</Eticheta>
                <p className="mt-1 text-sub text-ink-3">{g.sens}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6">
                  {g.tokeni.map((t) => (
                    <div key={t.nume} className="min-w-0">
                      <div className={`h-12 rounded-chip border border-line-2 ${t.cls}`} />
                      <p className="mt-1.5 truncate text-meta font-semibold text-ink-2">
                        {t.nume}
                      </p>
                      <p className="truncate text-meta text-ink-3">{t.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 2 ─ Scara tipografică */}
        <Card
          title="Scara tipografică"
          subtitle="Instrument Sans peste tot; serif doar pe titlul de pagină. Greutatea 700 e rezervată cifrelor și numelor."
        >
          <div>
            {SCARA.map((r) => (
              <div
                key={r.rol}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line-1 py-3 last:border-b-0"
              >
                <div className="min-w-0">{r.mostra}</div>
                <p className="text-meta text-ink-3">
                  {r.rol} · {r.cls} · {r.greutate}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* 3 ─ Cifre */}
        <Card
          title="Cifre"
          subtitle="Orice număr trece prin src/lib/format.ts. Procentele au întotdeauna o zecimală, iar minusul e minusul adevărat."
        >
          <TabelInCard minWidth="min-w-[420px]">
            <TableHead>
              <span className="min-w-0 flex-1">Apel</span>
              <span className="w-44 shrink-0 text-right">Rezultat</span>
            </TableHead>
            {CIFRE.map((c) => (
              <TableRow key={c.apel}>
                <span className="min-w-0 flex-1 truncate text-ink-2">{c.apel}</span>
                <span className="w-44 shrink-0 text-right font-bold tabular-nums text-ink-1">
                  {c.rezultat}
                </span>
              </TableRow>
            ))}
          </TabelInCard>
        </Card>

        {/* 4 ─ Butoane */}
        <Card
          title="Butoane"
          subtitle="Un singur buton principal pe ecran. Restul sunt fantomă sau text."
        >
          <div className="space-y-5">
            <Exemplu
              eticheta="În repaus"
              nota="Hover-ul nu se poate îngheța într-o pagină: treci cu mouse-ul peste fiecare buton ca să îl vezi. Cu tastatura, Tab arată inelul de focus."
            >
              <PrimaryButton onClick={() => setEcou('PrimaryButton apăsat')}>
                Salvează
              </PrimaryButton>
              <GhostButton onClick={() => setEcou('GhostButton apăsat')}>Renunță</GhostButton>
              <DangerButton label="Șterge" onConfirmed={() => setEcou('DangerButton confirmat')} />
              <BackLink label="Înapoi" onClick={() => setEcou('BackLink apăsat')} />
            </Exemplu>

            <Exemplu
              eticheta="Blocate"
              nota="DangerButton nu are stare blocată — cere confirmare prin a doua apăsare („Sigur? Apasă din nou”). BackLink duce mereu înapoi, deci nici el nu se blochează."
            >
              <PrimaryButton disabled>Salvează</PrimaryButton>
              <GhostButton disabled>Renunță</GhostButton>
            </Exemplu>
          </div>
        </Card>

        {/* 5 ─ Pastile */}
        <Card
          title="Pastile"
          subtitle="Culoarea e verdict: verde bani câștigați, chihlimbar în așteptare, roșu pierdem bani. Restul rămâne neutru."
        >
          <div className="space-y-5">
            <Exemplu eticheta="Pill · toate tonurile">
              <Pill tone="pos">Marjă {pct(0.239)}</Pill>
              <Pill tone="warn">În așteptare</Pill>
              <Pill tone="neg">{puncte(-4.2)}</Pill>
              <Pill tone="info">Reper de plan</Pill>
              <Pill tone="neutral">12 taskuri</Pill>
            </Exemplu>

            <Exemplu eticheta="NeutralPill" nota="Context fără verdict — scurtătura peste Pill tone=neutral.">
              <NeutralPill>Termoficare Sector 4</NeutralPill>
              <NeutralPill>{lei(486500)}</NeutralPill>
            </Exemplu>

            <Exemplu eticheta="KpiPill · good / warning / error">
              <KpiPill color="good">Conform planului</KpiPill>
              <KpiPill color="warning">{zile(2.4)} în urmă</KpiPill>
              <KpiPill color="error">{zile(8.1)} în urmă</KpiPill>
            </Exemplu>

            <Exemplu eticheta="StatusPill · toate statusurile">
              <StatusPill status="neinceput" />
              <StatusPill status="in_lucru" />
              <StatusPill status="finalizat" />
            </Exemplu>
          </div>
        </Card>

        {/* 6 ─ Bare */}
        <Card
          title="Bare"
          subtitle="Umplutura e realizatul, liniuța e reperul de plan de azi. MarginRail e componenta semnătură."
        >
          <div className="space-y-6">
            <div>
              <Eticheta>ProgressBar · fără reper de plan</Eticheta>
              <div className="mt-3 space-y-3">
                {(['neutral', 'pos', 'warn', 'neg', 'info'] as const).map((t) => (
                  <div key={t} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-meta text-ink-3">{t}</span>
                    <ProgressBar donePct={0.62} tone={t} className="flex-1" />
                    <span className="w-14 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
                      {pct(0.62)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Eticheta>ProgressBar · cu reper de plan</Eticheta>
              <div className="mt-3 space-y-3">
                {(['neutral', 'pos', 'warn', 'neg', 'info'] as const).map((t) => (
                  <div key={t} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-meta text-ink-3">{t}</span>
                    <ProgressBar donePct={0.62} planPct={0.75} tone={t} className="flex-1" />
                    <span className="w-14 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
                      {pct(0.62)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-sub text-ink-3">
                Realizat {pct(0.62)} față de un plan de {pct(0.75)}.
              </p>
            </div>

            <div>
              <Eticheta>MarginRail · real față de reperul de plan</Eticheta>
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-meta text-ink-3">peste plan</span>
                  <MarginRail actual={0.239} planned={0.18} scaleMax={0.35} tone="pos" className="flex-1" />
                  <span className="w-24 shrink-0 text-right text-row font-bold tabular-nums text-pos">
                    {pct(0.239)} · {puncte(5.9)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-meta text-ink-3">sub plan</span>
                  <MarginRail actual={0.062} planned={0.15} scaleMax={0.35} tone="neg" className="flex-1" />
                  <span className="w-24 shrink-0 text-right text-row font-bold tabular-nums text-neg">
                    {pct(0.062)} · {puncte(-8.8)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-meta text-ink-3">fără reper</span>
                  <MarginRail actual={0.121} planned={null} scaleMax={0.35} tone="warn" className="flex-1" />
                  <span className="w-24 shrink-0 text-right text-row font-bold tabular-nums text-warn">
                    {pct(0.121)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <Eticheta>WhatIfStrip</Eticheta>
              <div className="mt-3">
                <WhatIfStrip>
                  Dacă intră variația în așteptare, marja proiectului devine{' '}
                  <span className="font-bold tabular-nums text-ink-1">{pct(0.248)}</span> (
                  <span className="font-bold tabular-nums text-ink-1">{puncte(0.9)}</span>).
                </WhatIfStrip>
              </div>
            </div>
          </div>
        </Card>

        {/* 7 ─ Carduri */}
        <Card
          title="Carduri"
          subtitle="Un singur moment de culoare pe card: dacă o cifră e verde, restul cardului tace."
        >
          <div className="space-y-6">
            <Eticheta>Card · simplu, cu antet, apăsabil</Eticheta>
            <div className="rounded-chip bg-paper-2 p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <p className="text-row text-ink-2">
                    Card simplu: doar conținut, fără antet. Se folosește când titlul e deja dat de
                    context.
                  </p>
                </Card>

                <Card
                  title="Card cu antet"
                  subtitle="Titlu, subtitlu și o acțiune în colț"
                  action={<GhostButton onClick={() => setEcou('Acțiunea din card apăsată')}>Deschide</GhostButton>}
                >
                  <p className="text-row text-ink-2">
                    Antetul e locul unic pentru titlu, explicație și acțiune.
                  </p>
                </Card>

                <Card onClick={() => setEcou('Card apăsabil apăsat')} title="Card apăsabil">
                  <p className="text-row text-ink-2">
                    Se ridică 1px la hover și răspunde la Enter când e focusat.
                  </p>
                </Card>
              </div>
            </div>

            <Eticheta>StatCard · normal și hero</Eticheta>
            <div className="rounded-chip bg-paper-2 p-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label="Lucrări executate"
                  value={`${compact(2482395)} lei`}
                  pills={[{ text: `${pct(0.62)} din contract`, tone: 'neutral' }]}
                  footnote="Din valoarea contractată de 4,01M lei"
                />
                <StatCard
                  label="Marja proiectului"
                  value={pct(0.239)}
                  tone="pos"
                  pills={[
                    { text: `plan ${pct(0.18)}`, tone: 'neutral' },
                    { text: puncte(5.9), tone: 'pos' },
                  ]}
                  footnote="Peste marja planificată la ofertare"
                  hero
                />
                <StatCard
                  label="Grafic"
                  value={`${zile(8.1)} în urmă`}
                  tone="neg"
                  pills={[{ text: 'Termoficare · tronson A', tone: 'neutral' }]}
                  footnote={`Termen contractual ${dataRo('2026-09-30')}`}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* 8 ─ Control segmentat + tabel */}
        <Card
          title="Control segmentat și tabel"
          subtitle="Fără zebră, fără linii verticale: separator subțire, sumele la dreapta, subsol pe paper-1."
        >
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl options={PERIOADE} value={perioada} onChange={setPerioada} />
            <span className="text-sub text-ink-3">
              Selecție:{' '}
              <span className="font-semibold text-ink-1">
                {PERIOADE.find((p) => p.value === perioada)?.label}
              </span>
            </span>
          </div>

          <TabelInCard minWidth="min-w-[560px]">
            <TableHead>
              <span className="min-w-0 flex-1">Job</span>
              <span className="w-48 shrink-0">Progres</span>
              <span className="w-36 shrink-0 text-right">Valoare</span>
            </TableHead>
            {/* rândurile stau într-un container propriu, ca ultimul rând să nu
                dubleze bordura de sus a subsolului */}
            <div>
              {JOBURI.map((j) => (
                <TableRow key={j.nume} onClick={() => setEcou(`Rând apăsat: ${j.nume}`)}>
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-1">{j.nume}</span>
                  <span className="flex w-48 shrink-0 items-center gap-2">
                    <ProgressBar
                      donePct={j.done}
                      planPct={j.plan}
                      tone="neutral"
                      className="flex-1"
                    />
                    <span className="w-12 shrink-0 text-right font-bold tabular-nums text-ink-1">
                      {pct(j.done)}
                    </span>
                  </span>
                  <span className="w-36 shrink-0 text-right font-semibold tabular-nums text-ink-1">
                    {lei(j.valoare)}
                  </span>
                </TableRow>
              ))}
            </div>
            <TableFooter>
              <span>{JOBURI.length} joburi</span>
              <span className="font-bold tabular-nums text-ink-1">{lei(TOTAL_JOBURI)}</span>
            </TableFooter>
          </TabelInCard>
        </Card>

        {/* 9 ─ Stări */}
        <Card
          title="Stări"
          subtitle="Aici cad aplicațiile vii: schelet cât timp datele sunt pe drum, o propoziție când lista e goală, o bandă când citirea a eșuat."
        >
          <div className="space-y-6">
            <div>
              <Eticheta>Skeleton · blocuri</Eticheta>
              <div className="mt-3 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
              <p className="mt-2 text-sub text-ink-3">
                Scheletul are forma componentei care urmează. Cifrele nu clipesc de la 0 la valoarea
                reală.
              </p>
            </div>

            <div>
              <Eticheta>StatCardSkeleton</Eticheta>
              <div className="mt-3 rounded-chip bg-paper-2 p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </div>
              </div>
            </div>

            <div>
              <Eticheta>EmptyState</Eticheta>
              <div className="mt-3 rounded-chip border border-line-2 bg-paper-0">
                <EmptyState
                  title="Niciun job pe acest proiect"
                  action={
                    <PrimaryButton onClick={() => setEcou('Acțiunea din starea goală apăsată')}>
                      Adaugă un job
                    </PrimaryButton>
                  }
                >
                  Joburile împart contractul în bucăți cu buget și termen. Adaugă primul job ca să
                  poți urmări progresul.
                </EmptyState>
              </div>
            </div>

            <div>
              <Eticheta>ErrorStrip</Eticheta>
              <div className="mt-3">
                <ErrorStrip
                  message="Nu am putut citi joburile proiectului."
                  onRetry={() => setEcou('Reîncercare cerută')}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
