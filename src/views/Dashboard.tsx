// Dashboard — ecranul de start al biroului, pe sistemul Clean Ledger.
// Începe cu BANII (marjă, certificat, cost), apoi arată marja pe fiecare proiect
// față de plan, apoi spune CE E DE FĂCUT. Totul e derivat din datele existente.
import { useMemo } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import { jobTargetInvoiceDate, todayIso } from '../data/projects'
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
} from '../domain/kpi'
import { DASH, compact, compactLei, dataRo, lei, pct, puncte, zile } from '../lib/format'
import {
  Card,
  EmptyState,
  GhostButton,
  MarginRail,
  PrimaryButton,
  StatCard,
  toneOf,
  toneText,
  type Tone,
} from '../components/ui'
import { PageHeader, lunaCurenta } from '../components/Shell'
import type { Selection } from '../lib/selection'

// ── Bucăți mici de UI ────────────────────────────────────────────────────

/** „1 bucată" / „3 bucăți" — numărătoarea variațiilor. */
function bucati(n: number): string {
  return `${n} ${n === 1 ? 'bucată' : 'bucăți'}`
}

/**
 * Cifra de detaliu dintr-un card cu trei coloane: etichetă → cifră (text-stat-sm)
 * → o notă. Nu e un StatCard (acela e el însuși un card); e o celulă dintr-unul.
 */
function MiniStat({
  label,
  value,
  tone = 'neutral',
  note,
}: {
  label: string
  value: string
  tone?: Tone
  note: string
}) {
  return (
    <div className="min-w-0">
      <p className="text-sub font-medium text-ink-3">{label}</p>
      <p
        className={`mt-1 text-stat-sm font-bold tracking-[-0.02em] tabular-nums ${toneText(tone)}`}
      >
        {value}
      </p>
      <p className="mt-0.5 truncate text-sub text-ink-3">{note}</p>
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

/** Punctul pătrat din fața alertei — culoarea e verdictul, nu decor. */
const DOT: Record<AlertTone, string> = {
  red: 'bg-neg-fill',
  amber: 'bg-warn-fill',
  blue: 'bg-info-fill',
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
        text: `${p.name} pierde bani: costul e cu ${pct(overPct)} peste cât ar fi trebuit la ${pct(p.kpis.donePct)} realizat.`,
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

  // 3. ținte de facturare depășite — ținta jobului o dată, nu o dată pe task
  for (const p of active) {
    for (const j of p.jobs) {
      const jobTarget = jobTargetInvoiceDate(j)
      if (jobTarget && jobTarget < today) {
        out.push({
          tone: 'amber',
          text: `${j.name} (${p.name}) trebuia facturat pe ${dataRo(jobTarget)}.`,
          action: 'Deschide jobul →',
          go: () => onOpen({ projectId: p.id, jobId: j.id }),
        })
      }
      for (const t of j.tasks) {
        // taskurile fără țintă proprie moștenesc jobul; nu le anunțăm din nou
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
      p.jobs.flatMap((j) => {
        const jobTarget = jobTargetInvoiceDate(j)
        const dinJob =
          jobTarget && jobTarget >= today
            ? [{ date: jobTarget, label: `${j.name} · tot jobul` }]
            : []
        const dinTaskuri = j.tasks
          .filter((t) => t.target_invoice_date && t.target_invoice_date >= today)
          .map((t) => ({ date: t.target_invoice_date!, label: `${t.name} · ${j.name}` }))
        return [...dinJob, ...dinTaskuri]
      })
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
    <div className="mx-auto max-w-[1500px] px-5 py-6 md:px-8">
      <PageHeader
        title="Dashboard"
        pill={lunaCurenta(today)}
        action={<PrimaryButton onClick={onNewVariation}>Variație nouă</PrimaryButton>}
      />

      {/* cele trei cifre mari — cifra e singurul moment de culoare din card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          hero
          label="Marjă la zi"
          value={compactLei(Math.round(marginLei))}
          tone={toneOf(marginColor(marginPct))}
          pills={[
            { text: `${pct(marginPct)} din valoare` },
            ...(pointsVsPlan !== null
              ? [{ text: `${puncte(pointsVsPlan)} față de plan` }]
              : []),
          ]}
        />
        <StatCard
          hero
          label="Valoare certificată"
          value={compactLei(Math.round(certificat))}
          pills={[{ text: `${pct(certifiedPctOfContract)} din contracte` }]}
        />
        <StatCard
          hero
          label="Cost la zi"
          value={compactLei(Math.round(cost))}
          pills={
            vt.pending !== 0
              ? [{ text: `${compactLei(vt.pending)} variații în așteptare`, tone: 'warn' }]
              : [{ text: 'nicio variație în așteptare' }]
          }
        />
      </div>

      {/* marja pe proiect + necesită atenție */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card
          title="Marjă pe proiect"
          subtitle={`Marja reală pe scara 0–${pct(scaleMax)} · liniuța gri e marja planificată`}
        >
          {active.length === 0 ? (
            <EmptyState title="Niciun proiect activ">
              Marjele apar aici imediat ce un proiect activ are lucrări executate.
            </EmptyState>
          ) : (
            <div className="-mx-5">
              {started.map((p) => {
                const budget = p.jobs.reduce((s, j) => s + j.kpis.budgetTotal, 0)
                const planned = plannedMargin(Number(p.contract_value), budget)
                const tone = toneOf(marginColor(p.kpis.margin))
                return (
                  <button
                    key={p.id}
                    onClick={() => onOpenProject({ projectId: p.id })}
                    className="grid w-full grid-cols-[minmax(0,1.1fr)_minmax(48px,1fr)_auto] items-center gap-3 border-b border-line-1 px-5 py-3 text-left transition-colors duration-[120ms] ease-std last:border-b-0 hover:bg-paper-1 sm:gap-4"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-row font-bold text-ink-1">
                        {p.name}
                      </span>
                      <span className="block truncate text-sub text-ink-3">
                        {p.client ? `${p.client} · ` : ''}
                        {pct(p.kpis.donePct)} realizat
                      </span>
                    </span>
                    <MarginRail
                      actual={p.kpis.margin}
                      planned={planned}
                      scaleMax={scaleMax}
                      tone={tone}
                    />
                    <span className="whitespace-nowrap text-right text-row tabular-nums">
                      <strong className={`font-bold ${toneText(tone)}`}>
                        {pct(p.kpis.margin)}
                      </strong>
                      <span className="text-ink-3">
                        {planned !== null ? ` · plan ${pct(planned)}` : ' · fără buget'}
                      </span>
                    </span>
                  </button>
                )
              })}
              {/* proiectele fără lucrări executate nu au marjă de judecat — nu le
                  colorăm în roșu, doar le numărăm, ca lista să rămână despre bani */}
              {notStarted.length > 0 && (
                <p className="px-5 pt-3 text-sub text-ink-3">
                  {notStarted.length}{' '}
                  {notStarted.length === 1 ? 'proiect activ nu are' : 'proiecte active nu au'} încă
                  lucrări executate — apar aici după prima raportare.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Necesită atenție"
          subtitle={
            alerts.length === 0
              ? 'nimic urgent'
              : `${alerts.length} ${alerts.length === 1 ? 'lucru' : 'lucruri'} săptămâna asta`
          }
        >
          {alerts.length === 0 ? (
            <EmptyState title="Nimic urgent">
              Niciun proiect nu pierde bani, nicio variație nu așteaptă și nicio țintă de facturare
              nu e depășită.
            </EmptyState>
          ) : (
            <div className="-mx-5">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className="flex gap-2.5 border-b border-line-1 px-5 py-3 last:border-b-0"
                >
                  <span
                    aria-hidden
                    className={`mt-[5px] h-[7px] w-[7px] shrink-0 rounded-[2px] ${DOT[a.tone]}`}
                  />
                  <div className="min-w-0">
                    <p className="text-row leading-snug text-ink-2">{a.text}</p>
                    <button
                      onClick={a.go}
                      className="mt-1 rounded-chip text-row font-semibold text-accent-ink transition-colors duration-[120ms] ease-std hover:text-accent-hover hover:underline"
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
        <Card
          title={`Variații · ${lunaCurenta(today).toLowerCase()}`}
          subtitle="Lucrări suplimentare propuse clientului și starea lor"
        >
          {variations.length === 0 ? (
            <EmptyState
              title="Nicio variație"
              action={<GhostButton onClick={onNewVariation}>Variație nouă</GhostButton>}
            >
              Aici apar lucrările suplimentare, cu suma cerută și răspunsul clientului.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <MiniStat
                label="Aprobate"
                value={`${vt.approved >= 0 ? '+' : ''}${compact(vt.approved)}`}
                tone="pos"
                note={bucati(vt.approvedCount)}
              />
              <MiniStat
                label="În așteptare"
                value={`${vt.pending >= 0 ? '+' : ''}${compact(vt.pending)}`}
                tone="warn"
                note={bucati(vt.pendingCount)}
              />
              <MiniStat
                label="Respinse"
                value={compact(vt.rejected)}
                note={bucati(vt.rejectedCount)}
              />
            </div>
          )}
        </Card>

        <Card
          title="Bani și situații"
          subtitle="Ce e facturat și neîncasat, ce e reținut și ce urmează"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniStat
              label="Facturat, neîncasat"
              value={compact(outstanding)}
              note={avgAge !== null ? `în medie de ${zile(avgAge)}` : 'fără date de facturare'}
            />
            <MiniStat
              label="Garanții reținute"
              value={compact(retentions)}
              note={
                retentionProjects > 0
                  ? `pe ${retentionProjects} ${retentionProjects === 1 ? 'proiect' : 'proiecte'}`
                  : 'niciun procent setat'
              }
            />
            <MiniStat
              label="Următoarea facturare"
              value={nextInvoice ? dataRo(nextInvoice.date) : DASH}
              note={nextInvoice ? nextInvoice.label : 'nicio țintă planificată'}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
