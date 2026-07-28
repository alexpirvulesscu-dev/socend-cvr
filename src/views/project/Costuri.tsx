// Fila „Costuri" a unui proiect — READ-ONLY. Costurile se înregistrează în
// cardul jobului; aici se citește doar verdictul: cât s-a cheltuit, cât aveam
// voie la stadiul actual și unde se duc banii (categorie, job, ultimele intrări).
//
// Toate cifrele sunt rulate din joburi (job.kpis / job.costByCategory), ca
// fiecare zonă din panou să spună același lucru: banda de sus = subsolul
// tabelului pe joburi = totalul pe categorii.
import { useMemo } from 'react'
import {
  COST_CATEGORY_LABELS,
  type CostCategory,
  type CostRow,
  type ProjectWithKpis,
} from '../../data/projects'
import { costColor } from '../../domain/kpi'
import { DASH, compact, dataScurt, lei, pct } from '../../lib/format'
import {
  Card,
  EmptyState,
  NeutralPill,
  ProgressBar,
  StatCard,
  TableFooter,
  TableHead,
  TableRow,
  toneOf,
  toneText,
  type Tone,
} from '../../components/ui'

/** Ordinea de citire a categoriilor în acest panou — aceeași peste tot. */
const CATEGORY_ORDER: CostCategory[] = [
  'manopera',
  'materiale',
  'subcontractori',
  'utilaje',
  'organizare',
]

/** Câte intrări de cost arătăm în „Ultimele costuri". */
const RECENT_LIMIT = 12

/** Peste cât din suma permisă trecem de la „atenție" la „depășit". */
const WARN_MARGIN = 1.05

// Lățimile coloanelor, ținute într-un singur loc ca antetul, rândurile și
// subsolul să nu se desincronizeze niciodată.
const COL_DONE = 'w-[148px] shrink-0'
const COL_MONEY = 'w-[124px] shrink-0 text-right'
const COL_DATE = 'w-[76px] shrink-0'
const COL_JOB = 'w-[172px] shrink-0'
const COL_CAT = 'w-[132px] shrink-0'

/**
 * Verdictul unei categorii: sub suma permisă = bine, până la 5% peste =
 * atenție, mai mult = depășit. Fără cheltuială nu există verdict.
 */
function categoryTone(spent: number, allowed: number): Tone {
  if (spent <= 0) return 'neutral'
  if (spent <= allowed) return 'pos'
  if (allowed > 0 && spent <= allowed * WARN_MARGIN) return 'warn'
  return 'neg'
}

/** Diferența față de buget: pozitiv = sub buget (verde), negativ = depășire. */
function varianceTone(v: number): Tone {
  return toneOf(costColor(v))
}

/** Suma cu semn, forma scurtă pentru carduri: „+312k" / „−48k". */
function signedCompact(n: number): string {
  return `${n >= 0 ? '+' : ''}${compact(n)}`
}

/** Suma cu semn, forma de tabel: „+312.400 lei" / „−48.100 lei". */
function signedLei(n: number): string {
  return `${n >= 0 ? '+' : ''}${lei(n)}`
}

interface Recent extends CostRow {
  jobName: string
}

export function CosturiProiect({ p }: { p: ProjectWithKpis }) {
  const donePct = p.kpis.donePct

  // ── Totalurile, rulate din joburi ──────────────────────────────────────
  const totals = useMemo(() => {
    let actual = 0
    let budget = 0
    let allowed = 0
    let variance = 0
    for (const j of p.jobs) {
      actual += j.kpis.actualCost
      budget += j.kpis.budgetTotal
      // bugetul câștigat al jobului = buget × procent realizat
      allowed += j.kpis.costVariance + j.kpis.actualCost
      variance += j.kpis.costVariance
    }
    return { actual, budget, allowed, variance }
  }, [p.jobs])

  // ── Cheltuiala și bugetul pe categorie ─────────────────────────────────
  const categories = useMemo(() => {
    const rows = CATEGORY_ORDER.map((cat) => {
      let spent = 0
      let budget = 0
      for (const j of p.jobs) {
        spent += j.costByCategory[cat]
        budget += j.budgetByCategory[cat]
      }
      return { cat, spent, budget, allowed: budget * donePct }
    })
    // scara barelor = cel mai mare buget din listă; dacă o categorie a depășit
    // deja acel plafon, întindem scara până la ea, ca bara să nu mintă
    const scale = Math.max(...rows.map((r) => Math.max(r.budget, r.spent)), 1)
    return { rows, scale }
  }, [p.jobs, donePct])

  // ── Ultimele intrări de cost, din tot proiectul ────────────────────────
  const recent = useMemo<Recent[]>(() => {
    const out: Recent[] = []
    for (const j of p.jobs) {
      for (const c of j.cvr_cost_entries) out.push({ ...c, jobName: j.name })
    }
    return out
      .sort((a, b) =>
        a.entry_date === b.entry_date
          ? a.id.localeCompare(b.id)
          : b.entry_date.localeCompare(a.entry_date)
      )
      .slice(0, RECENT_LIMIT)
  }, [p.jobs])

  const costCount = p.jobs.reduce((s, j) => s + j.cvr_cost_entries.length, 0)

  return (
    <div className="space-y-4">
      {/* ── Banda de cifre ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Cost la zi"
          value={`${compact(totals.actual)} lei`}
          pills={[
            {
              text: `${costCount} ${costCount === 1 ? 'înregistrare' : 'înregistrări'}`,
            },
          ]}
          footnote={lei(totals.actual)}
        />
        <StatCard
          label="Buget total"
          value={`${compact(totals.budget)} lei`}
          pills={[{ text: `${p.jobs.length} ${p.jobs.length === 1 ? 'job' : 'joburi'}` }]}
          footnote={lei(totals.budget)}
        />
        <StatCard
          label="Permis la stadiul actual"
          value={`${compact(totals.allowed)} lei`}
          pills={[{ text: `la ${pct(donePct)} realizat` }]}
          footnote="buget × procent realizat"
        />
        <StatCard
          label="Diferență"
          value={`${signedCompact(totals.variance)} lei`}
          tone={varianceTone(totals.variance)}
          pills={[
            { text: totals.variance >= 0 ? 'sub bugetul câștigat' : 'peste bugetul câștigat' },
          ]}
          footnote={signedLei(totals.variance)}
        />
      </div>

      {/* ── Cost pe categorie ──────────────────────────────────────────── */}
      <Card
        title="Cost pe categorie"
        subtitle={`Bara arată cât s-a cheltuit pe fiecare categorie, iar liniuța gri cât aveam voie la ${pct(donePct)} realizat.`}
      >
        <div className="divide-y divide-line-1">
          {categories.rows.map((r) => {
            const tone = categoryTone(r.spent, r.allowed)
            const loud = tone === 'warn' || tone === 'neg'
            return (
              <div key={r.cat} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-row font-medium text-ink-1">
                    {COST_CATEGORY_LABELS[r.cat]}
                  </span>
                  <span className="text-row tabular-nums">
                    <span className={`font-bold ${loud ? toneText(tone) : 'text-ink-1'}`}>
                      {lei(r.spent)}
                    </span>
                    <span className="text-ink-3"> / permis {lei(r.allowed)}</span>
                  </span>
                </div>
                <ProgressBar
                  className="mt-2"
                  tone={tone}
                  donePct={r.spent / categories.scale}
                  planPct={r.allowed / categories.scale}
                  title={`${COST_CATEGORY_LABELS[r.cat]}: ${lei(r.spent)} cheltuit · permis ${lei(
                    r.allowed
                  )} · buget ${lei(r.budget)}`}
                />
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-baseline justify-between border-t border-line-2 pt-3">
          <span className="text-row font-medium text-ink-2">Total cheltuit</span>
          <span className="text-row font-bold tabular-nums text-ink-1">{lei(totals.actual)}</span>
        </div>
      </Card>

      {/* ── Cost pe job ────────────────────────────────────────────────── */}
      <Card
        className="overflow-hidden"
        title="Cost pe job"
        subtitle="Diferența e bugetul câștigat de fiecare job (buget × procent realizat) minus costul real."
      >
        <div className="-mx-5 -mb-5 mt-1 overflow-x-auto">
          {p.jobs.length === 0 ? (
            <EmptyState title="Proiectul nu are joburi">
              Adaugă joburi ca să poți urmări bugetul și costul.
            </EmptyState>
          ) : (
            <div className="min-w-[760px]">
              <TableHead>
                <span className="min-w-0 flex-1">Job</span>
                <span className={COL_DONE}>Realizat</span>
                <span className={COL_MONEY}>Cost real</span>
                <span className={COL_MONEY}>Buget</span>
                <span className={COL_MONEY}>Diferență</span>
              </TableHead>

              {p.jobs.map((j) => {
                const k = j.kpis
                return (
                  <TableRow key={j.id}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-1">{j.name}</p>
                    </div>
                    <div className={`${COL_DONE} flex items-center gap-2`}>
                      <ProgressBar donePct={k.donePct} tone="neutral" className="flex-1" />
                      <span className="w-12 shrink-0 text-right font-bold tabular-nums text-ink-1">
                        {pct(k.donePct)}
                      </span>
                    </div>
                    <div className={`${COL_MONEY} tabular-nums text-ink-1`}>
                      {lei(k.actualCost)}
                    </div>
                    <div className={`${COL_MONEY} tabular-nums text-ink-2`}>
                      {lei(k.budgetTotal)}
                    </div>
                    <div
                      className={`${COL_MONEY} font-bold tabular-nums ${toneText(
                        varianceTone(k.costVariance)
                      )}`}
                    >
                      {signedLei(k.costVariance)}
                    </div>
                  </TableRow>
                )
              })}

              <TableFooter>
                <div className="flex w-full items-center gap-4">
                  <span className="min-w-0 flex-1 font-semibold text-ink-1">
                    Total {p.jobs.length} {p.jobs.length === 1 ? 'job' : 'joburi'}
                  </span>
                  <span className={`${COL_DONE} text-right font-bold tabular-nums text-ink-1`}>
                    {pct(donePct)}
                  </span>
                  <span className={`${COL_MONEY} font-bold tabular-nums text-ink-1`}>
                    {lei(totals.actual)}
                  </span>
                  <span className={`${COL_MONEY} tabular-nums text-ink-2`}>
                    {lei(totals.budget)}
                  </span>
                  <span
                    className={`${COL_MONEY} font-bold tabular-nums ${toneText(
                      varianceTone(totals.variance)
                    )}`}
                  >
                    {signedLei(totals.variance)}
                  </span>
                </div>
              </TableFooter>
            </div>
          )}
        </div>
      </Card>

      {/* ── Ultimele costuri ───────────────────────────────────────────── */}
      <Card
        className="overflow-hidden"
        title="Ultimele costuri"
        subtitle={`Cele mai recente ${RECENT_LIMIT} intrări din tot proiectul, cea mai nouă prima.`}
        action={
          costCount > RECENT_LIMIT ? <NeutralPill>din {costCount}</NeutralPill> : undefined
        }
      >
        <div className="-mx-5 -mb-5 mt-1 overflow-x-auto">
          {recent.length === 0 ? (
            <EmptyState title="Niciun cost înregistrat">
              Costurile se adaugă pe job, în panoul de detaliu al jobului.
            </EmptyState>
          ) : (
            <div className="min-w-[720px]">
              <TableHead>
                <span className={COL_DATE}>Data</span>
                <span className={COL_JOB}>Job</span>
                <span className={COL_CAT}>Categorie</span>
                <span className="min-w-0 flex-1">Descriere</span>
                <span className={COL_MONEY}>Sumă</span>
              </TableHead>

              {recent.map((c) => (
                <TableRow key={c.id}>
                  <div className={`${COL_DATE} tabular-nums text-ink-2`}>
                    {dataScurt(c.entry_date)}
                  </div>
                  <div className={`${COL_JOB} truncate text-ink-2`} title={c.jobName}>
                    {c.jobName}
                  </div>
                  <div className={`${COL_CAT} text-ink-3`}>{COST_CATEGORY_LABELS[c.category]}</div>
                  <div className="min-w-0 flex-1 truncate text-ink-1">
                    {c.description?.trim() ? c.description : DASH}
                  </div>
                  <div className={`${COL_MONEY} font-bold tabular-nums text-ink-1`}>
                    {lei(Number(c.amount))}
                  </div>
                </TableRow>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
