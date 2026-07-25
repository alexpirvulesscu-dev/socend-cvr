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
import { compact, num, pct, zile } from '../lib/format'
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
  forecast,
  color,
}: {
  eyebrow: string
  question: string
  value: string
  caption: string
  /** linia de prognoză „la final estimăm…" (când progresul e destul de mare) */
  forecast?: string
  color?: KpiColor
}) {
  return (
    <Card className="flex flex-col !p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">{eyebrow}</p>
      <p className="mt-0.5 text-xs text-[#5B6673]">{question}</p>
      <p className={`mt-0.5 text-xl font-semibold tracking-tight ${color ? VALUE_COLOR[color] : ''}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-[#5B6673]">{caption}</p>
      {forecast && (
        <p className="mt-auto border-t border-[#F3F1EC] pt-1.5 text-[11px] leading-snug text-[#5B6673]">
          <span className="font-medium text-[#0D1A2D]">La final: </span>
          {forecast}
        </p>
      )}
    </Card>
  )
}

/** „PT2" din „Punct Termic 2 (PT2)" — eticheta scurtă pentru captions. */
function shortJobName(name: string): string {
  return name.match(/\(([^)]+)\)/)?.[1] ?? name
}

/** Cele 5 carduri pentru UN proiect (întrebările exacte din design). */
function ProjectKpiBand({ p }: { p: ProjectWithKpis }) {
  const k = p.kpis
  const shouldCost = k.costVariance + k.actualCost

  // KPI 02: conduce cel mai întârziat job, nu media care îl ascunde
  const worst = [...p.jobs].sort((a, b) => b.kpis.behindDays - a.kpis.behindDays)[0]
  const behindCount = p.jobs.filter((j) => j.kpis.behindDays >= 2).length
  const graficCaption =
    !worst || worst.kpis.behindDays < 2
      ? 'toate joburile conform planului'
      : `cel mai în urmă: ${shortJobName(worst.name)} (${zile(worst.kpis.behindDays)})` +
        (behindCount > 1 ? ` · încă ${behindCount - 1} în urmă` : '')
  // întârzierea în bani: muncă ce trebuia executată (deci facturabilă) până azi
  const lateLei = Math.round(k.scheduleVarianceLei)

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
        forecast={
          lateLei > 0
            ? `muncă de ${compact(lateLei)} lei trebuia executată până azi`
            : undefined
        }
        color={scheduleColor(k.behindDays)}
      />
      <KpiCard
        eyebrow="03 · Cost vs buget"
        question="A costat cât am planificat?"
        value={`${k.costVariance >= 0 ? '+' : ''}${compact(k.costVariance)}`}
        caption={`trebuia ${compact(shouldCost)} · a costat ${compact(k.actualCost)}`}
        forecast={k.eacCost !== null ? `cost ~${compact(k.eacCost)} lei` : undefined}
        color={costColor(k.costVariance)}
      />
      <KpiCard
        eyebrow="04 · Marjă la zi"
        question="Câștigăm bani?"
        value={pct(k.margin)}
        caption="din fiecare leu executat, atât rămâne după costuri"
        forecast={
          k.forecastMargin !== null ? `marjă ~${pct(k.forecastMargin)} la ritmul actual` : undefined
        }
        color={marginColor(k.margin)}
      />
      <KpiCard
        eyebrow="05 · Încasări"
        question="Unde sunt banii?"
        value={`${num(k.cashPct * 100, 0)}% încasat`}
        caption={`${compact(k.billing.incasat)} din ${compact(k.billing.facturat)} facturat`}
        forecast={k.wip > 0 ? `${compact(k.wip)} lei construiți și neprobați` : undefined}
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
  const worst = [...projects].sort((a, b) => b.kpis.behindDays - a.kpis.behindDays)[0]
  const graficValue =
    behind.length === 0
      ? 'toate conform planului'
      : behind.length === 1
        ? '1 proiect în urmă'
        : `${behind.length} proiecte în urmă`
  const graficCaption =
    !worst || worst.kpis.behindDays < 2
      ? 'niciun proiect nu depășește 2 zile'
      : `cel mai în urmă: ${worst.name.split(' ')[0]} (${zile(worst.kpis.behindDays)})`
  const lateLei = Math.round(
    projects.reduce((s, p) => s + Math.max(0, p.kpis.scheduleVarianceLei), 0)
  )
  const totalEac = projects.reduce((s, p) => s + (p.kpis.eacCost ?? 0), 0)
  const eacKnown = projects.some((p) => p.kpis.eacCost !== null)
  const forecastMarginTotal =
    eacKnown && totalContract > 0 ? (totalContract - totalEac) / totalContract : null

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
        forecast={
          lateLei > 0 ? `muncă de ${compact(lateLei)} lei trebuia executată până azi` : undefined
        }
        color={behind.length === 0 ? 'good' : 'warning'}
      />
      <KpiCard
        eyebrow="03 · Cost vs buget"
        question="A costat cât am planificat?"
        value={`${totalCostVar >= 0 ? '+' : ''}${compact(totalCostVar)}`}
        caption={`trebuia ${compact(shouldCost)} · a costat ${compact(totalCost)}`}
        forecast={eacKnown ? `cost ~${compact(totalEac)} lei` : undefined}
        color={costColor(totalCostVar)}
      />
      <KpiCard
        eyebrow="04 · Marjă la zi"
        question="Câștigăm bani?"
        value={pct(marginTotal)}
        caption="din fiecare leu executat, atât rămâne după costuri"
        forecast={
          forecastMarginTotal !== null
            ? `marjă ~${pct(forecastMarginTotal)} la ritmul actual`
            : undefined
        }
        color={marginColor(marginTotal)}
      />
      <KpiCard
        eyebrow="05 · Încasări"
        question="Unde sunt banii?"
        value={`${num(cash * 100, 0)}% încasat`}
        caption={`${compact(totalIncasat)} din ${compact(totalFacturat)} facturat`}
        forecast={totalWip > 0 ? `${compact(totalWip)} lei construiți și neprobați` : undefined}
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
