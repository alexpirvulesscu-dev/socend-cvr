// Panoul de bord (v4) — ecranul de start al biroului, după referința de design.
// Începe cu BANII (marjă, certificat, cost), apoi arată marja pe fiecare proiect
// față de plan, apoi spune CE E DE FĂCUT. Totul e derivat din datele existente.
import { useMemo } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import { todayIso } from '../data/projects'
import {
  variationTotals,
  type VariationRow,
} from '../data/variations'
import {
  marginColor,
  marginPointsVsPlan,
  outstandingAgeDays,
  plannedMargin,
  retentionHeld,
  weightedOutstandingAge,
  type KpiColor,
} from '../domain/kpi'
import { compact, dataRo, lei, num, pct, zile } from '../lib/format'
import { Card } from '../components/ui'
import { PageHeader, PrimaryButton, lunaCurenta } from '../components/Shell'
import type { Selection } from '../lib/selection'

// ── Bucăți mici de UI ────────────────────────────────────────────────────

const PILL: Record<KpiColor | 'neutral', string> = {
  good: 'bg-[#DDEDDC] text-[#46862A]',
  warning: 'bg-[#FBF0D3] text-[#A87400]',
  error: 'bg-[#F8DEDE] text-[#B23A3A]',
  neutral: 'bg-[#EEECE7] text-[#5B6673]',
}

function StatCard({
  label,
  value,
  valueColor,
  pills,
}: {
  label: string
  value: string
  valueColor?: string
  pills: { text: string; tone: KpiColor | 'neutral' }[]
}) {
  return (
    <Card className="!p-5">
      <p className="text-sm text-[#5B6673]">{label}</p>
      <p className={`mt-1.5 text-[34px] font-semibold leading-none tracking-tight ${valueColor ?? ''}`}>
        {value}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {pills.map((p) => (
          <span
            key={p.text}
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${PILL[p.tone]}`}
          >
            {p.text}
          </span>
        ))}
      </div>
    </Card>
  )
}

/** Bara de marjă cu reperul planificat — scara e comună tuturor rândurilor. */
function MarginBar({
  actual,
  planned,
  scaleMax,
}: {
  actual: number
  planned: number | null
  scaleMax: number
}) {
  const clamp = (v: number) => Math.min(Math.max(v, 0), scaleMax) / scaleMax
  const tone = marginColor(actual)
  const fill =
    tone === 'good' ? 'bg-[#58A834]' : tone === 'warning' ? 'bg-[#F0A800]' : 'bg-[#D64545]'
  return (
    <div className="relative h-2 w-full rounded-full bg-[#EEECE7]">
      <div
        className={`h-2 rounded-full ${fill}`}
        style={{ width: `${clamp(actual) * 100}%`, minWidth: actual > 0 ? 6 : 0 }}
      />
      {planned !== null && (
        <div
          title={`Marjă planificată ${pct(planned)}`}
          className="absolute -top-1 h-4 w-0.5 rounded bg-[#8798AC]"
          style={{ left: `calc(${clamp(planned) * 100}% - 1px)` }}
        />
      )}
    </div>
  )
}

// ── Alertele „Necesită atenție" ──────────────────────────────────────────

type AlertTone = 'red' | 'amber' | 'blue'
interface Alert {
  tone: AlertTone
  text: string
  action: string
  go: () => void
}

const DOT: Record<AlertTone, string> = {
  red: 'bg-[#D64545]',
  amber: 'bg-[#F0A800]',
  blue: 'bg-[#5B85AA]',
}

/** Regulile care produc lista — ordonate: bani pierduți, apoi termene, apoi info. */
function buildAlerts(
  projects: ProjectWithKpis[],
  variations: VariationRow[],
  today: string,
  onOpen: (sel: Selection) => void,
  onNav: (n: 'variatii' | 'urmeaza') => void
): Alert[] {
  const out: Alert[] = []
  const active = projects.filter((p) => p.active)

  // 1. proiecte care pierd bani: costul a depășit bugetul câștigat
  for (const p of active) {
    if (p.kpis.costVariance < 0 && p.kpis.donePct > 0) {
      const allowable = p.kpis.costVariance + p.kpis.actualCost
      const overPct = allowable > 0 ? Math.abs(p.kpis.costVariance) / allowable : 0
      out.push({
        tone: 'red',
        text: `${p.name} pierde bani: costul e cu ${pct(overPct, 0)} peste cât ar fi trebuit la ${pct(p.kpis.donePct, 0)} realizat.`,
        action: 'Vezi costurile →',
        go: () => onOpen({ projectId: p.id }),
      })
    }
  }

  // 2. variații care așteaptă răspunsul clientului de prea mult timp
  const byId = new Map(projects.map((p) => [p.id, p.name]))
  for (const v of variations) {
    if (v.status !== 'in_asteptare') continue
    const days = outstandingAgeDays(v.submitted_date, today) ?? 0
    if (days < 7) continue
    out.push({
      tone: 'amber',
      text: `${v.ref} · ${lei(v.amount)} pe ${byId.get(v.project_id) ?? 'proiect'} așteaptă răspunsul clientului de ${zile(days)}.`,
      action: 'Urmărește clientul →',
      go: () => onNav('variatii'),
    })
  }

  // 3. ținte de facturare depășite
  for (const p of active) {
    for (const j of p.jobs) {
      for (const t of j.tasks) {
        if (!t.target_invoice_date || t.target_invoice_date >= today) continue
        out.push({
          tone: 'amber',
          text: `${t.name} (${j.name}) trebuia facturat pe ${dataRo(t.target_invoice_date)}.`,
          action: 'Deschide taskul →',
          go: () => onOpen({ projectId: p.id, jobId: j.id, taskId: t.id }),
        })
      }
    }
  }

  // 4. joburi care au depășit planul INIȚIAL promis clientului
  for (const p of active) {
    for (const j of p.jobs) {
      const slip = j.kpis.baselineSlipDays
      if (slip === null || slip < 7) continue
      out.push({
        tone: 'blue',
        text: `${j.name} a depășit planul inițial cu ${zile(slip)} (${p.name}).`,
        action: 'Vezi în Gantt →',
        go: () => onOpen({ projectId: p.id, jobId: j.id }),
      })
    }
  }

  return out.slice(0, 5)
}

// ── Panoul ───────────────────────────────────────────────────────────────

export function DashboardView({
  projects,
  variations,
  onOpenProject,
  onNav,
  onNewVariation,
}: {
  projects: ProjectWithKpis[]
  variations: VariationRow[]
  onOpenProject: (sel: Selection) => void
  onNav: (n: 'variatii' | 'urmeaza') => void
  onNewVariation: () => void
}) {
  const today = todayIso()
  const active = useMemo(() => projects.filter((p) => p.active), [projects])

  // ── totalurile de portofoliu ──
  const value = active.reduce((s, p) => s + Number(p.contract_value), 0)
  const ev = active.reduce((s, p) => s + p.kpis.ev, 0)
  const cost = active.reduce((s, p) => s + p.kpis.actualCost, 0)
  const marginLei = ev - cost
  const marginPct = ev > 0 ? marginLei / ev : 0

  const budgetTotal = active.reduce(
    (s, p) => s + p.jobs.reduce((js, j) => js + j.kpis.budgetTotal, 0),
    0
  )
  const plannedPortfolio = plannedMargin(value, budgetTotal)
  const pointsVsPlan = marginPointsVsPlan(marginPct, plannedPortfolio)

  const certificat = active.reduce((s, p) => s + p.billing.certificat, 0)
  const facturat = active.reduce((s, p) => s + p.billing.facturat, 0)
  const incasat = active.reduce((s, p) => s + p.billing.incasat, 0)
  const certifiedPctOfContract = value > 0 ? certificat / value : 0

  const vt = variationTotals(variations)

  // ── bani & situații ──
  const outstanding = Math.max(0, facturat - incasat)
  const ageItems = active.flatMap((p) =>
    p.jobs.map((j) => {
      const b = j.kpis.billing
      const bill = Array.isArray(j.cvr_job_billing) ? j.cvr_job_billing[0] : j.cvr_job_billing
      return {
        outstanding: Math.max(0, b.facturat - b.incasat),
        ageDays: outstandingAgeDays(bill?.data_facturii ?? null, today),
      }
    })
  )
  const avgAge = weightedOutstandingAge(ageItems)
  const retentions = active.reduce(
    (s, p) => s + retentionHeld(p.billing.facturat, Number(p.retentie_pct)),
    0
  )
  const retentionProjects = active.filter((p) => Number(p.retentie_pct) > 0).length

  // următoarea țintă de facturare
  const nextInvoice = active
    .flatMap((p) =>
      p.jobs.flatMap((j) =>
        j.tasks
          .filter((t) => t.target_invoice_date && t.target_invoice_date >= today)
          .map((t) => ({ date: t.target_invoice_date!, label: `${t.name} · ${j.name}` }))
      )
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  const alerts = buildAlerts(projects, variations, today, onOpenProject, onNav)

  // Un proiect fără lucrări executate nu are marjă de judecat: 0% nu înseamnă
  // „pierdem bani", înseamnă „încă n-a început". Îl ținem în afara graficului.
  const started = useMemo(() => active.filter((p) => p.kpis.ev > 0), [active])
  const notStarted = active.length - started.length > 0 ? active.filter((p) => p.kpis.ev <= 0) : []

  // scara barelor de marjă: până la 18% ca în referință, dar urcă dacă e nevoie
  const scaleMax = Math.max(
    0.18,
    ...started.map((p) =>
      Math.max(
        p.kpis.margin,
        plannedMargin(
          Number(p.contract_value),
          p.jobs.reduce((s, j) => s + j.kpis.budgetTotal, 0)
        ) ?? 0
      )
    )
  )

  return (
    <div className="mx-auto max-w-[1500px] px-8 py-6">
      <PageHeader
        title="Panou"
        pill={lunaCurenta(today)}
        action={<PrimaryButton onClick={onNewVariation}>Variație nouă</PrimaryButton>}
      />

      {/* cele trei cifre mari */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Marjă la zi"
          value={lei(Math.round(marginLei))}
          valueColor={marginLei >= 0 ? 'text-[#46862A]' : 'text-[#D64545]'}
          pills={[
            { text: `${pct(marginPct)} din valoare`, tone: marginColor(marginPct) },
            ...(pointsVsPlan !== null
              ? [
                  {
                    text: `${pointsVsPlan >= 0 ? '+' : '−'}${num(Math.abs(pointsVsPlan), 1)} pt față de plan`,
                    tone: (pointsVsPlan >= 0 ? 'good' : 'warning') as KpiColor,
                  },
                ]
              : []),
          ]}
        />
        <StatCard
          label="Valoare certificată"
          value={lei(Math.round(certificat))}
          pills={[{ text: `${pct(certifiedPctOfContract, 0)} din contracte`, tone: 'neutral' }]}
        />
        <StatCard
          label="Cost la zi"
          value={lei(Math.round(cost))}
          pills={
            vt.pending !== 0
              ? [{ text: `${compact(vt.pending)} lei variații în așteptare`, tone: 'warning' }]
              : [{ text: 'nicio variație în așteptare', tone: 'neutral' }]
          }
        />
      </div>

      {/* marja pe proiect + necesită atenție */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="!p-5">
          <h2 className="text-lg font-semibold">Marjă pe proiect</h2>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            Marja reală pe scara 0–{pct(scaleMax, 0)} · liniuța gri e marja planificată
          </p>
          <div className="mt-4 divide-y divide-[#F3F1EC]">
            {active.length === 0 && (
              <p className="py-6 text-center text-sm text-[#5B6673]">Niciun proiect activ.</p>
            )}
            {started.map((p) => {
              const budget = p.jobs.reduce((s, j) => s + j.kpis.budgetTotal, 0)
              const planned = plannedMargin(Number(p.contract_value), budget)
              const tone = marginColor(p.kpis.margin)
              return (
                <button
                  key={p.id}
                  onClick={() => onOpenProject({ projectId: p.id })}
                  className="grid w-full grid-cols-[minmax(140px,1.1fr)_minmax(120px,1fr)_auto] items-center gap-4 py-3 text-left hover:opacity-80"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-[#5B6673]">
                      {p.client ? `${p.client} · ` : ''}
                      {pct(p.kpis.donePct, 0)} realizat
                    </span>
                  </span>
                  <MarginBar actual={p.kpis.margin} planned={planned} scaleMax={scaleMax} />
                  <span className="whitespace-nowrap text-right text-sm tabular-nums">
                    <strong
                      className={
                        tone === 'error'
                          ? 'text-[#D64545]'
                          : tone === 'warning'
                            ? 'text-[#A87400]'
                            : 'text-[#46862A]'
                      }
                    >
                      {pct(p.kpis.margin)}
                    </strong>
                    <span className="text-[#5B6673]">
                      {planned !== null ? ` · plan ${pct(planned)}` : ' · fără buget'}
                    </span>
                  </span>
                </button>
              )
            })}
            {/* proiectele fără lucrări executate nu au marjă de judecat — nu le
                colorăm în roșu, doar le numărăm, ca lista să rămână despre bani */}
            {notStarted.length > 0 && (
              <p className="pt-3 text-xs text-[#5B6673]">
                {notStarted.length}{' '}
                {notStarted.length === 1 ? 'proiect activ nu are' : 'proiecte active nu au'} încă
                lucrări executate — apar aici după prima raportare.
              </p>
            )}
          </div>
        </Card>

        <Card className="!p-5">
          <h2 className="text-lg font-semibold">Necesită atenție</h2>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            {alerts.length === 0
              ? 'nimic urgent'
              : `${alerts.length} ${alerts.length === 1 ? 'lucru' : 'lucruri'} săptămâna asta`}
          </p>
          {alerts.length === 0 ? (
            <p className="mt-4 text-sm text-[#5B6673]">
              Niciun proiect nu pierde bani, nicio variație nu așteaptă și nicio țintă de facturare
              nu e depășită.
            </p>
          ) : (
            <div className="mt-2 divide-y divide-[#F3F1EC]">
              {alerts.map((a, i) => (
                <div key={i} className="flex gap-2.5 py-3">
                  <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[a.tone]}`} />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{a.text}</p>
                    <button
                      onClick={a.go}
                      className="mt-1 text-sm font-semibold text-[#2C6E36] hover:underline"
                    >
                      {a.action}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* variații + bani și situații */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="!p-5">
          <h2 className="text-lg font-semibold">Variații · {lunaCurenta(today).toLowerCase()}</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-[#5B6673]">Aprobate</p>
              <p className="mt-0.5 text-xl font-semibold text-[#46862A]">
                {vt.approved >= 0 ? '+' : ''}
                {compact(vt.approved)}
              </p>
              <p className="text-xs text-[#5B6673]">{vt.approvedCount} bucăți</p>
            </div>
            <div>
              <p className="text-sm text-[#5B6673]">În așteptare</p>
              <p className="mt-0.5 text-xl font-semibold text-[#A87400]">
                {vt.pending >= 0 ? '+' : ''}
                {compact(vt.pending)}
              </p>
              <p className="text-xs text-[#5B6673]">{vt.pendingCount} bucăți</p>
            </div>
            <div>
              <p className="text-sm text-[#5B6673]">Respinse</p>
              <p className="mt-0.5 text-xl font-semibold text-[#5B6673]">{compact(vt.rejected)}</p>
              <p className="text-xs text-[#5B6673]">{vt.rejectedCount} bucăți</p>
            </div>
          </div>
        </Card>

        <Card className="!p-5">
          <h2 className="text-lg font-semibold">Bani și situații</h2>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-[#5B6673]">Facturat, neîncasat</p>
              <p className="mt-0.5 text-xl font-semibold">{compact(outstanding)}</p>
              <p className="text-xs text-[#5B6673]">
                {avgAge !== null ? `în medie de ${zile(avgAge)}` : 'fără date de facturare'}
              </p>
            </div>
            <div>
              <p className="text-sm text-[#5B6673]">Garanții reținute</p>
              <p className="mt-0.5 text-xl font-semibold">{compact(retentions)}</p>
              <p className="text-xs text-[#5B6673]">
                {retentionProjects > 0
                  ? `pe ${retentionProjects} ${retentionProjects === 1 ? 'proiect' : 'proiecte'}`
                  : 'niciun procent setat'}
              </p>
            </div>
            <div>
              <p className="text-sm text-[#5B6673]">Următoarea facturare</p>
              <p className="mt-0.5 text-xl font-semibold">
                {nextInvoice ? dataRo(nextInvoice.date) : '—'}
              </p>
              <p className="truncate text-xs text-[#5B6673]">
                {nextInvoice ? nextInvoice.label : 'nicio țintă planificată'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
