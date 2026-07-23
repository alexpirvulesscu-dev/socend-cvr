// Banda de KPI-uri a Explorer-ului: cele 5 întrebări din design, mereu sus.
//  - fără proiect selectat → agregat pe companie (proiectele active mari)
//  - cu proiect selectat  → KPI-urile proiectului
import type { ProjectWithKpis } from '../data/projects'
import {
  cashColor,
  costColor,
  marginColor,
  scheduleColor,
  type KpiColor,
} from '../domain/kpi'
import { compact, num, pct } from '../lib/format'
import { Card, scheduleText } from '../components/ui'

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
    <Card className="space-y-0.5 !p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">{eyebrow}</p>
      <p className="text-xs text-[#5B6673]">{question}</p>
      <p className={`text-xl font-semibold tracking-tight ${color ? VALUE_COLOR[color] : ''}`}>
        {value}
      </p>
      <p className="text-[11px] leading-snug text-[#5B6673]">{caption}</p>
    </Card>
  )
}

/** Cele 5 carduri pentru UN proiect (întrebările exacte din design). */
function ProjectKpiBand({ p }: { p: ProjectWithKpis }) {
  const k = p.kpis
  const shouldCost = k.costVariance + k.actualCost
  const behindJobs = p.jobs.filter((j) => j.kpis.behindDays >= 2)
  const graficCaption =
    behindJobs.length === 0
      ? 'toate joburile conform planului'
      : `${behindJobs.map((j) => j.name.match(/\(([^)]+)\)/)?.[1] ?? j.name).join(', ')} în urmă · restul conform planului`

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
  )
}

/** Cele 5 carduri agregate pe companie (proiectele active mari). */
function CompanyKpiBand({ projects }: { projects: ProjectWithKpis[] }) {
  const totalContract = projects.reduce((s, p) => s + Number(p.contract_value), 0)
  const totalEV = projects.reduce((s, p) => s + p.kpis.ev, 0)
  const totalCost = projects.reduce((s, p) => s + p.kpis.actualCost, 0)
  const totalCostVar = projects.reduce((s, p) => s + p.kpis.costVariance, 0)
  const shouldCost = totalCostVar + totalCost
  const totalFacturat = projects.reduce((s, p) => s + p.billing.facturat, 0)
  const totalIncasat = projects.reduce((s, p) => s + p.billing.incasat, 0)
  const totalWip = projects.reduce((s, p) => s + p.kpis.wip, 0)

  const progress = totalContract > 0 ? totalEV / totalContract : 0
  const marginTotal = totalEV > 0 ? (totalEV - totalCost) / totalEV : 0
  const cash = totalFacturat > 0 ? totalIncasat / totalFacturat : 1

  const behind = projects.filter((p) => p.kpis.behindDays >= 2)
  const graficValue =
    behind.length === 0
      ? 'toate conform planului'
      : behind.length === 1
        ? '1 proiect în urmă'
        : `${behind.length} proiecte în urmă`
  const graficCaption = projects
    .map((p) => {
      const first = p.name.split(' ')[0]
      const t = scheduleText(p.kpis.behindDays)
      return `${first} ${t.charAt(0).toLowerCase()}${t.slice(1)}`
    })
    .join(' · ')

  if (projects.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        eyebrow="01 · Progres"
        question="Cât s-a construit?"
        value={pct(progress)}
        caption={`lucrări executate ${compact(totalEV)} din ${compact(totalContract)} contracte`}
      />
      <KpiCard
        eyebrow="02 · Grafic"
        question="În avans sau în urmă?"
        value={graficValue}
        caption={graficCaption}
        color={behind.length === 0 ? 'good' : 'warning'}
      />
      <KpiCard
        eyebrow="03 · Cost vs buget"
        question="A costat cât am planificat?"
        value={`${totalCostVar >= 0 ? '+' : ''}${compact(totalCostVar)}`}
        caption={`atât ar fi trebuit să coste: ${compact(shouldCost)} · a costat: ${compact(totalCost)}`}
        color={costColor(totalCostVar)}
      />
      <KpiCard
        eyebrow="04 · Marjă la zi"
        question="Câștigăm bani?"
        value={pct(marginTotal)}
        caption={`clienții ne datorează ${compact(totalEV)} — costul nostru ${compact(totalCost)}`}
        color={marginColor(marginTotal)}
      />
      <KpiCard
        eyebrow="05 · Încasări"
        question="Unde sunt banii?"
        value={`${num(cash * 100, 0)}% încasat`}
        caption={`din ce am facturat · construit dar nefacturat: ${compact(totalWip)}`}
        color={cashColor(cash)}
      />
    </div>
  )
}

/** Banda contextuală: proiectul selectat sau, fără selecție, compania. */
export function KpiBand({
  projects,
  selected,
}: {
  projects: ProjectWithKpis[]
  selected: ProjectWithKpis | undefined
}) {
  const mainActive = projects.filter((p) => p.active && !p.is_small)
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
        {selected ? `Proiect · ${selected.name}` : 'Companie · proiectele active'}
      </p>
      {selected ? <ProjectKpiBand p={selected} /> : <CompanyKpiBand projects={mainActive} />}
    </div>
  )
}
