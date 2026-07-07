// Ecranul de detaliu Proiect, 1:1 după design:
//  - cele 5 KPI-uri cu întrebările exacte din design (01 · Progres ... 05 · Încasări)
//  - „Flux facturare client": Executat → Aprobat → Facturat → Încasat
//  - joburile ca și carduri separate, clicabile, cu reacție la hover
import type { ProjectWithKpis } from '../data/projects'
import {
  cashColor,
  costColor,
  marginColor,
  scheduleColor,
  type KpiColor,
} from '../domain/kpi'
import { compact, dataRo, lei, num, pct } from '../lib/format'
import { BackLink, Card, KpiPill, NeutralPill, ProgressBar, scheduleText } from '../components/ui'

const VALUE_COLOR: Record<KpiColor, string> = {
  good: 'text-[#46862A]',
  warning: 'text-[#F0A800]',
  error: 'text-[#D64545]',
}

function KpiCard({
  eyebrow,
  question,
  value,
  caption,
  color,
}: {
  eyebrow: string
  question: string
  value: string
  caption: string
  color?: KpiColor
}) {
  return (
    <Card className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">{eyebrow}</p>
      <p className="text-sm text-[#5B6673]">{question}</p>
      <p className={`text-2xl font-semibold tracking-tight ${color ? VALUE_COLOR[color] : ''}`}>
        {value}
      </p>
      <p className="text-xs leading-relaxed text-[#5B6673]">{caption}</p>
    </Card>
  )
}

/** Fluxul de facturare, ca în design: Executat → Aprobat → Facturat → Încasat. */
function FluxFacturare({ p }: { p: ProjectWithKpis }) {
  const b = p.billing
  const steps = [
    { label: 'Executat', value: b.depus },
    { label: 'Aprobat', value: b.certificat },
    { label: 'Facturat', value: b.facturat },
    { label: 'Încasat', value: b.incasat, highlight: true },
  ]
  return (
    <Card>
      <h3 className="mb-4 text-base font-semibold">Flux facturare client</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-start gap-2">
            {i > 0 && (
              <span aria-hidden className="mt-1 hidden text-[#C9C5BC] sm:block">
                →
              </span>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                {s.label}
              </p>
              <p
                className={`mt-1 text-lg font-semibold tracking-tight ${
                  s.highlight ? 'text-[#F0A800]' : ''
                }`}
              >
                {lei(s.value)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {p.kpis.wip > 0 && (
        <p className="mt-4 border-t border-[#E8E8E8] pt-3 text-sm text-[#5B6673]">
          Construit dar nefacturat (WIP):{' '}
          <strong className="text-[#0D1A2D]">{lei(Math.round(p.kpis.wip))}</strong>
        </p>
      )}
    </Card>
  )
}

function CumSeCalculeaza() {
  const rows = [
    ['Progres', 'valoarea taskului × procentul realizat din livrabile, adunat pe tot proiectul'],
    ['Grafic', '(procent planificat azi − procent realizat) × durata jobului, în zile; media pe proiect e ponderată cu valoarea joburilor'],
    ['Cost vs buget', 'bugetul câștigat (buget × procent realizat) minus costurile reale; plus = sub buget'],
    ['Marjă la zi', '(lucrări executate − costuri reale) ÷ lucrări executate'],
    ['Încasări', 'încasat ÷ facturat; WIP = lucrări executate care nu au fost încă facturate'],
  ]
  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">Cum se calculează</h3>
      <dl className="space-y-2">
        {rows.map(([term, def]) => (
          <div key={term} className="text-sm">
            <dt className="inline font-medium">{term}:</dt>{' '}
            <dd className="inline text-[#5B6673]">{def}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export function ProiectView({
  project: p,
  onBack,
  onOpenJob,
}: {
  project: ProjectWithKpis
  onBack: () => void
  onOpenJob: (jobId: string) => void
}) {
  const k = p.kpis
  const shouldCost = k.costVariance + k.actualCost

  const behindJobs = p.jobs.filter((j) => j.kpis.behindDays >= 2)
  const graficCaption =
    behindJobs.length === 0
      ? 'toate joburile conform planului'
      : `${behindJobs.map((j) => j.name.match(/\(([^)]+)\)/)?.[1] ?? j.name).join(', ')} în urmă · restul conform planului`

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <BackLink label="Proiecte" onClick={onBack} />

      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold leading-tight">{p.name}</h1>
        <span className="shrink-0 text-sm text-[#5B6673]">{p.client}</span>
      </div>
      <p className="text-sm text-[#5B6673]">
        Contract {lei(p.contract_value)} ·{' '}
        {p.billing_mode === 'lunara' ? 'facturare lunară' : 'facturare pe stadii fizice'}
      </p>

      {/* Cele 5 KPI-uri — întrebările exacte din design, pe UN rând pe ecrane late */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          eyebrow="01 · Progres"
          question="Cât s-a construit?"
          value={pct(k.donePct)}
          caption={`lucrări executate ${compact(k.ev)} din ${compact(p.contract_value)} contract`}
        />
        <KpiCard
          eyebrow="02 · Grafic"
          question="În avans sau în urmă?"
          value={scheduleText(k.behindDays)}
          caption={graficCaption}
          color={scheduleColor(k.behindDays)}
        />
        <KpiCard
          eyebrow="03 · Cost vs buget"
          question="A costat cât am planificat?"
          value={`${k.costVariance >= 0 ? '+' : ''}${compact(k.costVariance)}`}
          caption={`atât ar fi trebuit să coste: ${compact(shouldCost)} · a costat: ${compact(k.actualCost)}`}
          color={costColor(k.costVariance)}
        />
        <KpiCard
          eyebrow="04 · Marjă la zi"
          question="Câștigăm bani?"
          value={pct(k.margin)}
          caption={`clienții ne datorează ${compact(k.ev)} — costul nostru ${compact(k.actualCost)}`}
          color={marginColor(k.margin)}
        />
        <KpiCard
          eyebrow="05 · Încasări"
          question="Unde sunt banii?"
          value={`${num(k.cashPct * 100, 0)}% încasat`}
          caption={`din ce am facturat · construit dar nefacturat: ${compact(k.wip)}`}
          color={cashColor(k.cashPct)}
        />
      </div>

      <FluxFacturare p={p} />

      {/* Joburi — carduri separate, clicabile, cu reacție la hover (ca în design) */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold">Joburi</h3>
        {p.jobs.length === 0 && (
          <Card>
            <p className="text-sm text-[#5B6673]">Proiectul nu are încă joburi configurate.</p>
          </Card>
        )}
        {p.jobs.map((j) => {
          const jk = j.kpis
          const inLucru = j.tasks.filter((t) => t.status === 'in_lucru').length
          return (
            <Card
              key={j.id}
              onClick={() => onOpenJob(j.id)}
              className="transition-transform duration-150 hover:translate-x-0.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold leading-tight">{j.name}</h4>
                  <p className="mt-0.5 text-sm text-[#5B6673]">
                    {dataRo(j.start_date)} – {dataRo(j.end_date)} · {lei(jk.value)}
                  </p>
                </div>
                <span aria-hidden className="shrink-0 text-lg text-[#C9C5BC]">
                  ›
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar donePct={jk.donePct} planPct={jk.planPct} className="flex-1" />
                <span className="w-12 shrink-0 text-right text-sm font-semibold">
                  {pct(jk.donePct, 0)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <KpiPill color={scheduleColor(jk.behindDays)}>{scheduleText(jk.behindDays)}</KpiPill>
                <NeutralPill>
                  {inLucru === 0
                    ? 'niciun task în lucru'
                    : inLucru === 1
                      ? 'un task în lucru'
                      : `${inLucru} taskuri în lucru`}
                </NeutralPill>
              </div>
            </Card>
          )
        })}
      </div>

      <CumSeCalculeaza />
    </div>
  )
}
