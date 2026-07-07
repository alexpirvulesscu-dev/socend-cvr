// Ecranul Proiecte, 1:1 după design:
//  - antet cu „N proiecte în derulare · contracte semnate X lei"
//  - un card pe proiect (valoare contract la dreapta, bară + reper plan, pastile)
//  - dedesubt, banda „COMPANIE · TOATE PROIECTELE" cu cele 5 KPI-uri pe un rând
import type { ProjectWithKpis } from '../data/projects'
import {
  cashColor,
  costColor,
  marginColor,
  scheduleColor,
  type KpiColor,
} from '../domain/kpi'
import { compact, lei, num, pct } from '../lib/format'
import { Card, KpiPill, NeutralPill, ProgressBar, scheduleText } from '../components/ui'

const VALUE_COLOR: Record<KpiColor, string> = {
  good: 'text-[#46862A]',
  warning: 'text-[#F0A800]',
  error: 'text-[#D64545]',
}

function billingLabel(mode: string): string {
  return mode === 'lunara' ? 'Facturare lunară' : 'Facturare pe stadii fizice'
}

function ProjectCard({ p, onOpen }: { p: ProjectWithKpis; onOpen: () => void }) {
  const k = p.kpis
  const costOk = costColor(k.costVariance)
  return (
    <Card
      onClick={onOpen}
      className="space-y-4 transition-transform duration-150 hover:translate-x-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{p.name}</h2>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            {p.client} · {billingLabel(p.billing_mode)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold">{lei(p.contract_value)}</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5B6673]">
            Valoare contract
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ProgressBar donePct={k.donePct} planPct={k.planPct} className="flex-1" />
        <span className="shrink-0 text-sm font-semibold">{pct(k.donePct)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <KpiPill color={scheduleColor(k.behindDays)}>{scheduleText(k.behindDays)}</KpiPill>
        <KpiPill color={costOk}>
          {costOk === 'good'
            ? `${compact(k.costVariance)} lei sub buget`
            : `${compact(-k.costVariance)} lei peste buget`}
        </KpiPill>
        <NeutralPill>Marjă {pct(k.margin)}</NeutralPill>
      </div>
    </Card>
  )
}

function CompanyKpiCard({
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

/** Banda cu cele 5 KPI-uri agregate pe toată compania (sub proiecte, ca în design). */
function CompanyKpis({ projects }: { projects: ProjectWithKpis[] }) {
  const totalContract = projects.reduce((s, p) => s + Number(p.contract_value), 0)
  const totalEV = projects.reduce((s, p) => s + p.kpis.ev, 0)
  const totalCost = projects.reduce((s, p) => s + p.kpis.actualCost, 0)
  const totalCostVar = projects.reduce((s, p) => s + p.kpis.costVariance, 0)
  const shouldCost = totalCostVar + totalCost // bugetul câștigat = variație + cost real
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
    <div className="space-y-3 pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
        Companie · toate proiectele
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <CompanyKpiCard
          eyebrow="01 · Progres"
          question="Cât s-a construit?"
          value={pct(progress)}
          caption={`lucrări executate ${compact(totalEV)} din ${compact(totalContract)} contracte`}
        />
        <CompanyKpiCard
          eyebrow="02 · Grafic"
          question="În avans sau în urmă?"
          value={graficValue}
          caption={graficCaption}
          color={behind.length === 0 ? 'good' : 'warning'}
        />
        <CompanyKpiCard
          eyebrow="03 · Cost vs buget"
          question="A costat cât am planificat?"
          value={`${totalCostVar >= 0 ? '+' : ''}${compact(totalCostVar)}`}
          caption={`atât ar fi trebuit să coste: ${compact(shouldCost)} · a costat: ${compact(totalCost)}`}
          color={costColor(totalCostVar)}
        />
        <CompanyKpiCard
          eyebrow="04 · Marjă la zi"
          question="Câștigăm bani?"
          value={pct(marginTotal)}
          caption={`clienții ne datorează ${compact(totalEV)} — costul nostru ${compact(totalCost)}`}
          color={marginColor(marginTotal)}
        />
        <CompanyKpiCard
          eyebrow="05 · Încasări"
          question="Unde sunt banii?"
          value={`${num(cash * 100, 0)}% încasat`}
          caption={`din ce am facturat · construit dar nefacturat: ${compact(totalWip)}`}
          color={cashColor(cash)}
        />
      </div>
    </div>
  )
}

export function ProiecteView({
  projects,
  onOpen,
  onNew,
}: {
  projects: ProjectWithKpis[]
  onOpen: (projectId: string) => void
  onNew: () => void
}) {
  const totalContract = projects.reduce((s, p) => s + Number(p.contract_value), 0)

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proiecte</h1>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            {projects.length === 1 ? 'un proiect în derulare' : `${projects.length} proiecte în derulare`}{' '}
            · contracte semnate {lei(totalContract)}
          </p>
        </div>
        <button
          onClick={onNew}
          className="shrink-0 rounded-full bg-[#58A834] px-4 py-2 text-sm font-medium text-white hover:bg-[#46862A]"
        >
          + Proiect nou
        </button>
      </div>

      {projects.length === 0 && (
        <Card className="py-10 text-center">
          <p className="font-medium">Niciun proiect încă</p>
          <p className="mt-1 text-sm text-[#5B6673]">
            Apasă „+ Proiect nou" ca să configurezi primul proiect.
          </p>
        </Card>
      )}

      {projects.map((p) => (
        <ProjectCard key={p.id} p={p} onOpen={() => onOpen(p.id)} />
      ))}

      <CompanyKpis projects={projects} />
    </div>
  )
}
