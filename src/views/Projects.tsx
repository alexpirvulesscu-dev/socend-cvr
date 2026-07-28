// Lista de proiecte — ecranul de intrare în zona Proiecte.
// Un card pe proiect, cu cifrele care contează dintr-o privire; click pe card →
// intri în proiect (ProjectPage). Nicio coloană de proiecte nu te mai urmărește
// înăuntru: acolo ai doar joburile, taskurile și livrabilele proiectului.
import { useMemo, useState } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import type { VariationRow } from '../data/variations'
import { marginColor, plannedMargin } from '../domain/kpi'
import { compact, dataRo, num, pct, zile } from '../lib/format'
import {
  Card,
  EmptyState,
  MarginRail,
  Pill,
  PrimaryButton,
  ProgressBar,
  SegmentedControl,
  toneOf,
  type Tone,
} from '../components/ui'
import { PageHeader } from '../components/Shell'

type Filtru = 'active' | 'mici' | 'finalizate'

/** Verdictul de sus-dreapta al cardului — un singur cuvânt despre sănătatea proiectului. */
function verdict(p: ProjectWithKpis): { label: string; tone: Tone } {
  if (!p.active) return { label: 'Finalizat', tone: 'neutral' }
  if (p.kpis.ev <= 0) return { label: 'Nu a început', tone: 'neutral' }
  if (p.kpis.margin < 0) return { label: 'Pierde bani', tone: 'neg' }
  if (p.kpis.behindDays >= 7 || p.kpis.margin < 0.08 || p.kpis.costVariance < 0)
    return { label: 'De urmărit', tone: 'warn' }
  return { label: 'Conform planului', tone: 'pos' }
}

/** Cel mult două pastile de context, alese în ordinea urgenței. */
function contextPills(p: ProjectWithKpis, pending: VariationRow[]): { text: string; tone: Tone }[] {
  const out: { text: string; tone: Tone }[] = []
  if (p.active && p.kpis.behindDays >= 2) {
    out.push({
      text: `${zile(p.kpis.behindDays)} în urmă`,
      tone: p.kpis.behindDays > 7 ? 'neg' : 'warn',
    })
  }
  if (pending.length === 1) {
    out.push({
      text: `${pending[0].ref} în așteptare · ${pending[0].amount >= 0 ? '+' : ''}${compact(pending[0].amount)} lei`,
      tone: 'warn',
    })
  } else if (pending.length > 1) {
    const sum = pending.reduce((s, v) => s + v.amount, 0)
    out.push({
      text: `${pending.length} variații în așteptare · ${sum >= 0 ? '+' : ''}${compact(sum)} lei`,
      tone: 'warn',
    })
  }
  if (out.length < 2 && p.kpis.wip > 0) {
    out.push({ text: `${compact(p.kpis.wip)} lei construiți și neprobați`, tone: 'neutral' })
  }
  if (out.length < 2 && p.kpis.billing.facturat > p.kpis.billing.incasat) {
    out.push({
      text: `${compact(p.kpis.billing.facturat - p.kpis.billing.incasat)} lei de încasat`,
      tone: 'neutral',
    })
  }
  return out.slice(0, 2)
}

function Numar({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <p className="text-meta font-medium uppercase tracking-[0.07em] text-ink-3">{label}</p>
      <p
        className={`mt-0.5 truncate text-row font-bold tabular-nums ${
          tone === 'pos'
            ? 'text-pos'
            : tone === 'warn'
              ? 'text-warn'
              : tone === 'neg'
                ? 'text-neg'
                : 'text-ink-1'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function ProjectCard({
  p,
  pending,
  onOpen,
}: {
  p: ProjectWithKpis
  pending: VariationRow[]
  onOpen: () => void
}) {
  const k = p.kpis
  const v = verdict(p)
  const pills = contextPills(p, pending)
  const planned = plannedMargin(
    k.ev,
    p.jobs.reduce((s, j) => s + j.kpis.budgetTotal, 0) * k.donePct
  )
  const marginTone = k.ev > 0 ? toneOf(marginColor(k.margin)) : 'neutral'
  const rezultat = k.ev - k.actualCost

  return (
    <Card onClick={onOpen} className="!p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-card font-semibold text-ink-1">{p.name}</h3>
          <p className="mt-0.5 truncate text-sub text-ink-3">
            {[p.client, `${p.jobs.length} ${p.jobs.length === 1 ? 'job' : 'joburi'}`]
              .filter(Boolean)
              .join(' · ')}
            {p.end_date ? ` · termen ${dataRo(p.end_date)}` : ''}
          </p>
        </div>
        <Pill tone={v.tone}>{v.label}</Pill>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numar label="Contract" value={`${compact(Number(p.contract_value))} lei`} />
        <Numar label="Executat" value={`${compact(k.ev)} lei`} />
        <Numar label="Cost" value={`${compact(k.actualCost)} lei`} />
        <Numar
          label="Rezultat"
          value={`${rezultat >= 0 ? '+' : ''}${compact(rezultat)} lei`}
          tone={k.ev > 0 ? (rezultat >= 0 ? 'pos' : 'neg') : 'neutral'}
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <ProgressBar donePct={k.donePct} planPct={k.planPct} className="flex-1" />
        <span className="w-11 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
          {pct(k.donePct)}
        </span>
      </div>

      {k.ev > 0 && (
        <p className="mt-2 text-row text-ink-3">
          <span
            className={`font-bold ${
              marginTone === 'pos' ? 'text-pos' : marginTone === 'warn' ? 'text-warn' : 'text-neg'
            }`}
          >
            {pct(k.margin)} marjă
          </span>
          {planned !== null && <> · plan {pct(planned)}</>}
        </p>
      )}

      {pills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pills.map((x) => (
            <Pill key={x.text} tone={x.tone}>
              {x.text}
            </Pill>
          ))}
        </div>
      )}
    </Card>
  )
}

export function ProjectsView({
  projects,
  variations,
  onOpen,
  onNew,
}: {
  projects: ProjectWithKpis[]
  variations: VariationRow[]
  onOpen: (projectId: string) => void
  onNew: () => void
}) {
  const [filtru, setFiltru] = useState<Filtru>('active')
  const [q, setQ] = useState('')

  const grupe = useMemo(
    () => ({
      active: projects.filter((p) => p.active && !p.is_small),
      mici: projects.filter((p) => p.active && p.is_small),
      finalizate: projects.filter((p) => !p.active),
    }),
    [projects]
  )

  const lista = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = grupe[filtru]
    if (!s) return base
    return base.filter(
      (p) => p.name.toLowerCase().includes(s) || (p.client ?? '').toLowerCase().includes(s)
    )
  }, [grupe, filtru, q])

  const pendingByProject = useMemo(() => {
    const m = new Map<string, VariationRow[]>()
    for (const v of variations) {
      if (v.status !== 'in_asteptare') continue
      const arr = m.get(v.project_id) ?? []
      arr.push(v)
      m.set(v.project_id, arr)
    }
    return m
  }, [variations])

  // pastilele de portofoliu: contractat, cât mai e de executat, variații nedecise
  const active = grupe.active.concat(grupe.mici)
  const contractat = active.reduce((s, p) => s + Number(p.contract_value), 0)
  const executat = active.reduce((s, p) => s + p.kpis.ev, 0)
  const pendingSum = variations
    .filter((v) => v.status === 'in_asteptare')
    .reduce((s, v) => s + v.amount, 0)

  return (
    <div className="mx-auto max-w-[1500px] px-8 py-6">
      <PageHeader
        title="Proiecte"
        action={<PrimaryButton onClick={onNew}>Proiect nou</PrimaryButton>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={filtru}
          onChange={setFiltru}
          options={[
            { value: 'active', label: `Active · ${grupe.active.length}` },
            { value: 'mici', label: `Mici · ${grupe.mici.length}` },
            { value: 'finalizate', label: `Finalizate · ${grupe.finalizate.length}` },
          ]}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Caută proiect sau client…"
          aria-label="Caută proiect"
          className="h-10 w-full max-w-xs rounded-btn border border-line-2 bg-paper-0 px-3 text-row text-ink-1 transition-colors duration-[120ms] ease-std placeholder:text-ink-4 hover:border-line-3 focus:border-accent"
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        <Pill tone="neutral">Contractat {compact(contractat)} lei</Pill>
        <Pill tone="neutral">Rămas de executat {compact(contractat - executat)} lei</Pill>
        {pendingSum !== 0 && (
          <Pill tone="warn">
            Variații în așteptare {pendingSum >= 0 ? '+' : ''}
            {compact(pendingSum)} lei
          </Pill>
        )}
      </div>

      {lista.length === 0 ? (
        <Card>
          <EmptyState
            title={q ? 'Niciun proiect nu se potrivește' : 'Niciun proiect aici'}
            action={q ? undefined : <PrimaryButton onClick={onNew}>Proiect nou</PrimaryButton>}
          >
            {q
              ? 'Încearcă alt cuvânt din nume sau din numele clientului.'
              : filtru === 'active'
                ? 'Proiectele mari și active apar aici. Începe cu „Proiect nou".'
                : filtru === 'mici'
                  ? 'Proiectele bifate „proiect mic" apar aici, ca să nu încarce lista principală.'
                  : 'Proiectele finalizate ajung aici după ce le închizi din pagina proiectului.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {lista.map((p) => (
            <ProjectCard
              key={p.id}
              p={p}
              pending={pendingByProject.get(p.id) ?? []}
              onOpen={() => onOpen(p.id)}
            />
          ))}
        </div>
      )}

      {/* agregatul proiectelor mici: o singură linie, când te uiți la ele */}
      {filtru === 'mici' && grupe.mici.length > 0 && <MiciTotal projects={grupe.mici} />}
    </div>
  )
}

/** „Câți bani fac, la un loc" pentru proiectele mici. */
function MiciTotal({ projects }: { projects: ProjectWithKpis[] }) {
  const value = projects.reduce((s, p) => s + Number(p.contract_value), 0)
  const ev = projects.reduce((s, p) => s + p.kpis.ev, 0)
  const cost = projects.reduce((s, p) => s + p.kpis.actualCost, 0)
  const rezultat = ev - cost
  const margin = ev > 0 ? rezultat / ev : 0
  const scaleMax = Math.max(0.24, margin * 1.2)
  return (
    <Card
      className="mt-4"
      title="Proiectele mici, la un loc"
      subtitle="Cât valorează împreună și cât rămâne din ele"
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Numar label="Valoare" value={`${compact(value)} lei`} />
        <Numar label="Executat" value={`${compact(ev)} lei`} />
        <Numar label="Cost" value={`${compact(cost)} lei`} />
        <Numar
          label="Rezultat"
          value={`${rezultat >= 0 ? '+' : ''}${compact(rezultat)} lei`}
          tone={rezultat >= 0 ? 'pos' : 'neg'}
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <MarginRail
          actual={margin}
          scaleMax={scaleMax}
          tone={ev > 0 ? toneOf(marginColor(margin)) : 'neutral'}
          className="flex-1"
        />
        <span className="w-20 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
          {pct(margin)} marjă
        </span>
      </div>
      <p className="mt-2 text-sub text-ink-3">
        {projects.length} {projects.length === 1 ? 'proiect mic' : 'proiecte mici'} ·{' '}
        {num(projects.reduce((s, p) => s + p.jobs.length, 0))} joburi
      </p>
    </Card>
  )
}
