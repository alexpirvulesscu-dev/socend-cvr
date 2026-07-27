// Banda de KPI-uri a ecranului Proiecte, în limbajul vizual din referință:
// etichetă mică (întrebarea în română), cifra mare, apoi pastile de context.
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
import { StatCard, scheduleText } from '../components/ui'

const VALUE_COLOR: Record<KpiColor, string> = {
  good: 'text-[#46862A]',
  warning: 'text-[#A87400]',
  error: 'text-[#D64545]',
}

/** „PT2" din „Punct Termic 2 (PT2)" — eticheta scurtă pentru captions. */
function shortJobName(name: string): string {
  return name.match(/\(([^)]+)\)/)?.[1] ?? name
}

/** Cele 5 cifre pentru UN proiect. */
function ProjectKpiBand({ p }: { p: ProjectWithKpis }) {
  const k = p.kpis
  const shouldCost = k.costVariance + k.actualCost

  const worst = [...p.jobs].sort((a, b) => b.kpis.behindDays - a.kpis.behindDays)[0]
  const behindCount = p.jobs.filter((j) => j.kpis.behindDays >= 2).length
  const lateLei = Math.round(k.scheduleVarianceLei)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label="Cât s-a construit?"
        value={pct(k.donePct)}
        pills={[{ text: `${compact(k.ev)} din ${compact(p.contract_value)} lei`, tone: 'neutral' }]}
      />
      <StatCard
        label="În avans sau în urmă?"
        value={scheduleText(k.behindDays)}
        valueColor={VALUE_COLOR[scheduleColor(k.behindDays)]}
        pills={[
          {
            text:
              !worst || worst.kpis.behindDays < 2
                ? 'toate joburile conform planului'
                : `cel mai în urmă: ${shortJobName(worst.name)}`,
            tone: 'neutral',
          },
          ...(behindCount > 1
            ? [{ text: `${behindCount} joburi în urmă`, tone: 'neutral' as const }]
            : []),
        ]}
        footnote={lateLei > 0 ? `muncă de ${compact(lateLei)} lei trebuia executată până azi` : undefined}
      />
      <StatCard
        label="A costat cât am planificat?"
        value={`${k.costVariance >= 0 ? '+' : ''}${compact(k.costVariance)}`}
        valueColor={VALUE_COLOR[costColor(k.costVariance)]}
        pills={[
          { text: `trebuia ${compact(shouldCost)}`, tone: 'neutral' },
          { text: `a costat ${compact(k.actualCost)}`, tone: 'neutral' },
        ]}
        footnote={k.eacCost !== null ? `la final estimăm ~${compact(k.eacCost)} lei` : undefined}
      />
      <StatCard
        label="Câștigăm bani?"
        value={pct(k.margin)}
        valueColor={VALUE_COLOR[marginColor(k.margin)]}
        pills={[{ text: 'din fiecare leu executat', tone: 'neutral' }]}
        footnote={
          k.forecastMargin !== null ? `la final ~${pct(k.forecastMargin)} în ritmul actual` : undefined
        }
      />
      <StatCard
        label="Unde sunt banii?"
        value={`${num(k.cashPct * 100, 0)}% încasat`}
        valueColor={VALUE_COLOR[cashColor(k.cashPct)]}
        pills={[
          { text: `${compact(k.billing.incasat)} din ${compact(k.billing.facturat)}`, tone: 'neutral' },
        ]}
        footnote={k.wip > 0 ? `${compact(k.wip)} lei construiți și neprobați` : undefined}
      />
    </div>
  )
}

/** Cele 5 cifre agregate pe companie (proiectele active mari). */
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
  const lateLei = Math.round(
    projects.reduce((s, p) => s + Math.max(0, p.kpis.scheduleVarianceLei), 0)
  )
  const totalEac = projects.reduce((s, p) => s + (p.kpis.eacCost ?? 0), 0)
  const eacKnown = projects.some((p) => p.kpis.eacCost !== null)

  if (projects.length === 0) return null

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <StatCard
        label="Cât s-a construit?"
        value={pct(progress)}
        pills={[{ text: `${compact(totalEV)} din ${compact(totalContract)} lei`, tone: 'neutral' }]}
      />
      <StatCard
        label="În avans sau în urmă?"
        value={
          behind.length === 0
            ? 'conform planului'
            : `${behind.length} ${behind.length === 1 ? 'proiect' : 'proiecte'} în urmă`
        }
        valueColor={behind.length === 0 ? VALUE_COLOR.good : VALUE_COLOR.warning}
        pills={[
          {
            text:
              !worst || worst.kpis.behindDays < 2
                ? 'niciun proiect peste 2 zile'
                : `cel mai în urmă: ${worst.name.split(' ')[0]} (${zile(worst.kpis.behindDays)})`,
            tone: 'neutral',
          },
        ]}
        footnote={lateLei > 0 ? `muncă de ${compact(lateLei)} lei trebuia executată până azi` : undefined}
      />
      <StatCard
        label="A costat cât am planificat?"
        value={`${totalCostVar >= 0 ? '+' : ''}${compact(totalCostVar)}`}
        valueColor={VALUE_COLOR[costColor(totalCostVar)]}
        pills={[
          { text: `trebuia ${compact(shouldCost)}`, tone: 'neutral' },
          { text: `a costat ${compact(totalCost)}`, tone: 'neutral' },
        ]}
        footnote={eacKnown ? `la final estimăm ~${compact(totalEac)} lei` : undefined}
      />
      <StatCard
        label="Câștigăm bani?"
        value={pct(marginTotal)}
        valueColor={VALUE_COLOR[marginColor(marginTotal)]}
        pills={[{ text: 'din fiecare leu executat', tone: 'neutral' }]}
      />
      <StatCard
        label="Unde sunt banii?"
        value={`${num(cash * 100, 0)}% încasat`}
        valueColor={VALUE_COLOR[cashColor(cash)]}
        pills={[
          { text: `${compact(totalIncasat)} din ${compact(totalFacturat)}`, tone: 'neutral' },
        ]}
        footnote={totalWip > 0 ? `${compact(totalWip)} lei construiți și neprobați` : undefined}
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
  return selected ? <ProjectKpiBand p={selected} /> : <CompanyKpiBand projects={mainActive} />
}
