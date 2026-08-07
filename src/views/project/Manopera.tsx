// Fila „Manoperă" a unui proiect: orele planificate față de orele lucrate.
//
// E singurul ecran care nu depinde de livrabile, de progres sau de bani. Dacă
// echipa e repartizată doar pe proiect, orele apar aici oricum — asta e regula
// pe care o cere Alex: „ca minim, vreau să știu câte ore am consumat pe proiect,
// job sau task, și să le compar cu cât am alocat".
//
// Orele vin agregate din bază (vederile `cvr_labour_by_*`), nu însumate în
// browser: altfel limita de 1.000 de rânduri a API-ului taie totalul în tăcere.
import { useMemo } from 'react'
import type { JobWithKpis, ProjectWithKpis } from '../../data/projects'
import { todayIso } from '../../data/projects'
import { updateJobPlannedHours, updateProjectPlannedHours } from '../../data/mutations'
import type { Save } from '../../data/save'
import {
  hoursOf,
  manDaysToHours,
  useLabourDays,
  type LabourHours,
} from '../../data/labour'
import {
  forecastHours,
  hoursLeft,
  labourCurve,
  labourVerdict,
  plannedHours,
  averagePerDay,
  byWeek,
  type LabourVerdict,
} from '../../domain/labour'
import { dataScurt, num, pct, toNum } from '../../lib/format'
import { InlineEdit } from '../../components/InlineEdit'
import {
  Card,
  EmptyState,
  NeutralPill,
  Pill,
  ProgressBar,
  StatCard,
  TableFooter,
  TableHead,
  TableRow,
  toneText,
  type Tone,
} from '../../components/ui'

const COL_HOURS = 'w-[104px] shrink-0 text-right'
const COL_BAR = 'w-[132px] shrink-0'

/** Cum se colorează verdictul consumului de ore. */
function verdictTone(v: LabourVerdict): Tone {
  if (v === 'peste_plan') return 'neg'
  if (v === 'aproape') return 'warn'
  if (v === 'sub_plan') return 'pos'
  return 'neutral'
}

function verdictLabel(v: LabourVerdict): string {
  if (v === 'peste_plan') return 'Peste plan'
  if (v === 'aproape') return 'Aproape de plan'
  if (v === 'sub_plan') return 'În plan'
  return 'Fără plan'
}

/** Planul unui job: numărul lui, altfel suma orelor planificate ale taskurilor. */
function jobPlan(job: JobWithKpis): number {
  return plannedHours({
    declared: job.planned_hours === null ? null : Number(job.planned_hours),
    children: job.tasks.map((t) => manDaysToHours(t.planned_man_days)),
  })
}

export function ManoperaProiect({
  p,
  save,
  hours,
}: {
  p: ProjectWithKpis
  save: Save
  hours: LabourHours
}) {
  const spent = hoursOf(hours, p.id)
  const { days, loading: daysLoading } = useLabourDays(p.id)

  // planul proiectului: numărul lui dacă e pus, altfel suma joburilor
  const jobPlans = useMemo(() => p.jobs.map((j) => ({ job: j, plan: jobPlan(j) })), [p.jobs])
  const plan = plannedHours({
    declared: p.planned_hours === null ? null : Number(p.planned_hours),
    children: jobPlans.map((x) => x.plan),
  })

  const verdict = labourVerdict(plan, spent.total)
  const tone = verdictTone(verdict)
  const left = hoursLeft(plan, spent.total)
  const rate = averagePerDay(days)
  const forecast = forecastHours(spent.total, days, p.start_date, p.end_date, todayIso())

  // orele repartizate pe joburi + restul, ca totalul să se închidă întotdeauna
  const onJobs = p.jobs.reduce((s, j) => s + (hours.byJob[j.id] ?? 0), 0)
  const unassigned = Math.max(0, spent.total - onJobs)

  const curve = useMemo(
    () => labourCurve(days, plan, p.start_date, p.end_date),
    [days, plan, p.start_date, p.end_date]
  )
  const weeks = useMemo(() => byWeek(days).slice(-12), [days])
  const weekMax = Math.max(...weeks.map((w) => w.hours), 1)

  function savePlanProiect(raw: string) {
    const val = raw.trim() === '' ? null : toNum(raw)
    save(
      { kind: 'project', id: p.id, patch: { planned_hours: val } },
      { kind: 'project', id: p.id, patch: { planned_hours: p.planned_hours } },
      () => updateProjectPlannedHours(p.id, val)
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Cifrele manoperei ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Ore planificate"
          value={
            <InlineEdit
              type="number"
              value={p.planned_hours === null ? '' : String(p.planned_hours)}
              display={
                <span className="tabular-nums">
                  {plan > 0 ? num(plan) : 'nesetat'}
                </span>
              }
              onSave={savePlanProiect}
              placeholder="ore"
              inputClassName="w-32 text-stat font-bold"
              title="Click pentru a seta orele alocate proiectului"
            />
          }
          pills={[
            {
              text:
                p.planned_hours === null && plan > 0
                  ? 'însumate din joburi'
                  : 'alocate la deschidere',
            },
          ]}
          footnote="Click pe număr ca să îl schimbi. Gol = se adună planul joburilor."
        />
        <StatCard
          label="Ore lucrate"
          value={num(spent.total)}
          tone={spent.total > 0 ? 'neutral' : undefined}
          pills={[{ text: plan > 0 ? `${pct(spent.total / plan)} din plan` : 'fără plan' }]}
          footnote={
            spent.firstDay
              ? `din ${dataScurt(spent.firstDay)} până în ${dataScurt(spent.lastDay ?? spent.firstDay)}`
              : 'niciun pontaj încă'
          }
        />
        <StatCard
          label={left >= 0 ? 'Ore rămase' : 'Depășire'}
          value={plan > 0 ? num(Math.abs(left)) : '—'}
          tone={plan > 0 ? tone : 'neutral'}
          pills={[{ text: verdictLabel(verdict) }]}
          footnote={plan > 0 ? undefined : 'setează orele planificate ca să apară verdictul'}
        />
        <StatCard
          label="Ritm"
          value={rate > 0 ? `${num(rate, 1)} ore/zi` : '—'}
          pills={[{ text: `${days.filter((d) => d.hours > 0).length} zile lucrate` }]}
          footnote={
            forecast !== null && plan > 0
              ? `în ritmul ăsta, la final ~${num(forecast)} ore față de ${num(plan)} planificate`
              : 'media pe zilele în care s-a pontat'
          }
        />
      </div>

      {/* ── Unde stau orele: regula de rulare în sus, făcută vizibilă ──── */}
      <Card
        title="Unde s-au înregistrat orele"
        subtitle="Orele se numără la nivelul la care a fost făcută repartiția și se adună în sus. Cele rămase pe proiect contează la fel de mult ca cele repartizate pe task."
      >
        <div className="divide-y divide-line-1">
          {[
            { label: 'Repartizate până la task', value: spent.peTask },
            { label: 'Repartizate pe job, nu pe task', value: spent.peJob },
            { label: 'Rămase la nivel de proiect', value: spent.peProiect },
          ].map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="text-row text-ink-2">{r.label}</span>
              <span className="text-row tabular-nums text-ink-1">
                {num(r.value)} ore
                <span className="text-ink-3">
                  {' '}
                  · {pct(spent.total > 0 ? r.value / spent.total : 0)}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line-2 pt-3">
          <span className="text-row font-semibold text-ink-1">Total ore lucrate</span>
          <span className="text-row font-bold tabular-nums text-ink-1">
            {num(spent.total)} ore
          </span>
        </div>
      </Card>

      {/* ── Plan vs lucrat, pe fiecare job ─────────────────────────────── */}
      <Card
        className="overflow-hidden"
        title="Manoperă pe job"
        subtitle="Planul se editează cu click. Orele unui job includ și orele taskurilor lui."
      >
        <div className="-mx-5 -mb-5 mt-1 overflow-x-auto">
          {p.jobs.length === 0 ? (
            <EmptyState title="Proiectul nu are joburi">
              Orele se înregistrează oricum pe proiect — vezi cardul de mai sus. Joburile
              adaugă doar detaliul.
            </EmptyState>
          ) : (
            <div className="min-w-[680px]">
              <TableHead>
                <span className="min-w-0 flex-1">Job</span>
                <span className={COL_HOURS}>Planificat</span>
                <span className={COL_HOURS}>Lucrat</span>
                <span className={COL_BAR}>Consum</span>
                <span className={COL_HOURS}>Rămas</span>
              </TableHead>

              {jobPlans.map(({ job, plan: jp }) => {
                const js = hours.byJob[job.id] ?? 0
                const jv = labourVerdict(jp, js)
                return (
                  <TableRow key={job.id}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-1">{job.name}</p>
                    </div>
                    <div className={`${COL_HOURS} tabular-nums text-ink-2`}>
                      <InlineEdit
                        type="number"
                        value={job.planned_hours === null ? '' : String(job.planned_hours)}
                        display={<span>{jp > 0 ? num(jp) : '—'}</span>}
                        onSave={(raw) => {
                          const val = raw.trim() === '' ? null : toNum(raw)
                          save(
                            { kind: 'job', id: job.id, patch: { planned_hours: val } },
                            {
                              kind: 'job',
                              id: job.id,
                              patch: { planned_hours: job.planned_hours },
                            },
                            () => updateJobPlannedHours(job.id, val)
                          )
                        }}
                        placeholder="ore"
                        inputClassName="w-20 text-right"
                        title="Click pentru a seta orele alocate jobului"
                      />
                    </div>
                    <div className={`${COL_HOURS} font-bold tabular-nums text-ink-1`}>
                      {num(js)}
                    </div>
                    <div className={COL_BAR}>
                      <ProgressBar
                        donePct={jp > 0 ? Math.min(js / jp, 1) : 0}
                        tone={verdictTone(jv)}
                        title={`${job.name}: ${num(js)} din ${num(jp)} ore`}
                      />
                    </div>
                    <div
                      className={`${COL_HOURS} tabular-nums ${
                        jp > 0 && js > jp ? toneText('neg') : 'text-ink-2'
                      }`}
                    >
                      {jp > 0 ? num(hoursLeft(jp, js)) : '—'}
                    </div>
                  </TableRow>
                )
              })}

              {unassigned > 0 && (
                <TableRow>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ink-2">Nerepartizate pe niciun job</p>
                  </div>
                  <div className={`${COL_HOURS} text-ink-3`}>—</div>
                  <div className={`${COL_HOURS} font-bold tabular-nums text-ink-1`}>
                    {num(unassigned)}
                  </div>
                  <div className={COL_BAR} />
                  <div className={`${COL_HOURS} text-ink-3`}>—</div>
                </TableRow>
              )}

              <TableFooter>
                <div className="flex w-full items-center gap-4">
                  <span className="min-w-0 flex-1 font-semibold text-ink-1">
                    Total {p.jobs.length} {p.jobs.length === 1 ? 'job' : 'joburi'}
                  </span>
                  <span className={`${COL_HOURS} tabular-nums text-ink-2`}>
                    {plan > 0 ? num(plan) : '—'}
                  </span>
                  <span className={`${COL_HOURS} font-bold tabular-nums text-ink-1`}>
                    {num(spent.total)}
                  </span>
                  <span className={COL_BAR} />
                  <span
                    className={`${COL_HOURS} font-bold tabular-nums ${
                      plan > 0 && left < 0 ? toneText('neg') : 'text-ink-2'
                    }`}
                  >
                    {plan > 0 ? num(left) : '—'}
                  </span>
                </div>
              </TableFooter>
            </div>
          )}
        </div>
      </Card>

      {/* ── Zi cu zi ───────────────────────────────────────────────────── */}
      <Card
        title="Zi cu zi"
        subtitle={
          plan > 0 && p.start_date && p.end_date
            ? 'Orele cumulate față de linia planului, întinsă pe zilele lucrătoare dintre start și termen.'
            : 'Orele cumulate. Pune un plan de ore și datele proiectului ca să apară și linia planului.'
        }
        action={
          curve.length > 0 ? (
            <NeutralPill>
              {curve.length} {curve.length === 1 ? 'zi' : 'zile'}
            </NeutralPill>
          ) : undefined
        }
      >
        {daysLoading ? (
          <p className="text-row text-ink-3">Se încarcă…</p>
        ) : curve.length === 0 ? (
          <EmptyState title="Niciun pontaj pe acest proiect">
            Când echipa e trecută în Pontaj pe proiect, orele apar aici — chiar dacă nu sunt
            repartizate pe job sau task.
          </EmptyState>
        ) : (
          <>
            <CumulativeChart curve={curve} plan={plan} />

            <div className="mt-5 border-t border-line-2 pt-4">
              <p className="mb-3 text-sub text-ink-3">Ore pe săptămână, ultimele 12</p>
              <div className="space-y-1.5">
                {weeks.map((w) => (
                  <div key={w.week} className="flex items-center gap-3">
                    <span className="w-[86px] shrink-0 text-sub tabular-nums text-ink-3">
                      {dataScurt(w.week)}
                    </span>
                    <ProgressBar donePct={w.hours / weekMax} tone="neutral" className="flex-1" />
                    <span className="w-[74px] shrink-0 text-right text-sub font-medium tabular-nums text-ink-1">
                      {num(w.hours)} ore
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

/** Curba cumulată: aria consumului, cu linia punctată a planului deasupra. */
function CumulativeChart({
  curve,
  plan,
}: {
  curve: { date: string; cumulative: number; plannedCumulative: number | null }[]
  plan: number
}) {
  const W = 720
  const H = 200
  const PAD = 8
  const max = Math.max(plan, ...curve.map((p) => p.cumulative), 1)
  const n = curve.length

  const x = (i: number) => (n === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (n - 1))
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2)

  const spentLine = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.cumulative)}`).join(' ')
  const spentArea = `${spentLine} L ${x(n - 1)} ${H - PAD} L ${x(0)} ${H - PAD} Z`
  const hasPlan = curve.some((p) => p.plannedCumulative !== null)
  const planLine = hasPlan
    ? curve
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.plannedCumulative ?? 0)}`)
        .join(' ')
    : null

  const last = curve[n - 1]
  const over = last.plannedCumulative !== null && last.cumulative > last.plannedCumulative

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sub text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-accent" /> lucrate
        </span>
        {hasPlan && (
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-ink-3" /> plan
          </span>
        )}
        {hasPlan && (
          <Pill tone={over ? 'warn' : 'pos'}>
            {over ? 'peste linia planului' : 'sub linia planului'}
          </Pill>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[200px] w-full min-w-[420px]"
          role="img"
          aria-label="Ore cumulate față de plan"
        >
          <path d={spentArea} className="fill-accent-soft" />
          <path d={spentLine} className="stroke-accent" strokeWidth={2} fill="none" />
          {planLine && (
            <path
              d={planLine}
              className="stroke-ink-3"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              fill="none"
            />
          )}
        </svg>
      </div>

      <div className="flex justify-between text-sub tabular-nums text-ink-3">
        <span>{dataScurt(curve[0].date)}</span>
        <span className="font-medium text-ink-1">{num(last.cumulative)} ore cumulate</span>
        <span>{dataScurt(last.date)}</span>
      </div>
    </div>
  )
}
