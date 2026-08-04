// Ecranele de șantier (mobile first, pentru Mihai):
//  1. „Azi" — bandă de zi verde (accentul sistemului), comutator de proiect,
//     „Pontaj spune", un card pe task cu manoperă azi, „Închide ziua".
//  2. „Ce s-a construit azi" — un rând pe livrabil cu steppere de 52px,
//     „Salvează ziua" → RPC atomic → „Zi închisă ✓".
//  3. „Progres" — toată ierarhia (proiect → job → task → livrabil), FĂRĂ bani:
//     unde suntem, ținta la zi și totalul, pentru fiecare livrabil.
// Regula ecranului: nicio sumă, niciun nume de om, doar taskurile cu manoperă azi.
import { useMemo, useState, type ReactNode } from 'react'
import {
  closeDay,
  type LabourTask,
  type ProgressJob,
  type ProgressProject,
  useLabourToday,
  useSkeletonProgress,
} from '../data/santier'
import { deliverablePct, planPct as planPctFn, projectKpis, taskPct } from '../domain/kpi'
import { num, pct, ziuaDeAzi as azi } from '../lib/format'
import { todayIso } from '../data/projects'
import {
  Card,
  EmptyState,
  ErrorStrip,
  GhostButton,
  PrimaryButton,
  ProgressBar,
  SegmentedControl,
  Skeleton,
  StatusPill,
} from '../components/ui'

/** Ținta de atingere de 40px, plus butoane pline pe toată lățimea pe telefon. */
const SEG_ON_PHONE = 'w-full [&>button]:min-h-10 [&>button]:flex-1'

/** „mai sunt 38 m" — restul de construit, cu zecimale doar când există. */
function remaining(left: number, um: string): string {
  return `mai sunt ${num(left, Number.isInteger(left) ? 0 : 1)} ${um}`
}

/** Progresul (realizat + plan) al unui proiect, calculat doar din schelet. */
function projectProgress(p: ProgressProject, today: string) {
  const jobs = p.jobs.map((j) => ({
    startDate: j.start_date,
    endDate: j.end_date,
    budgetTotal: 0,
    actualCost: 0,
    tasks: j.tasks.map((t) => ({
      value: Number(t.value),
      status: t.status,
      deliverables: t.deliverables.map((d) => ({
        qtyTotal: Number(d.qty_total),
        qtyDone: Number(d.qty_done),
        weight: Number(d.weight),
      })),
    })),
  }))
  // șantierul nu vede bani: din KPI-uri folosim doar progresul fizic și planul
  const k = projectKpis(jobs, today)
  return { donePct: k.donePct, planPct: k.planPct }
}

// ── Banda de zi ───────────────────────────────────────────────────────────
// Singura suprafață plină de accent din aplicație: verde, text alb, data cu
// serif (h1 îl ia automat), supratitlul într-un alb translucid.
function DayBand({
  caption,
  title,
  back,
  children,
}: {
  caption?: string
  title: string
  /** înlocuiește supratitlul cu o întoarcere, în ecranul de raportare */
  back?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="bg-accent px-4 pb-6 pt-6 text-paper-0">
      <div className="mx-auto max-w-lg">
        {back ?? (
          <p className="text-sub font-medium uppercase tracking-[0.07em] text-paper-0/70">
            {caption}
          </p>
        )}
        <h1 className="mt-1.5 text-[clamp(24px,2.2vw,31px)] leading-none text-paper-0">{title}</h1>
        {children}
      </div>
    </div>
  )
}

/** Comutatorul de proiect din bandă — pastile albe pe verde, 40px înălțime. */
function ProjectChips({
  projectNames,
  selected,
  onSelect,
}: {
  projectNames: string[]
  selected: string | null
  onSelect: (name: string) => void
}) {
  return (
    <div className="mt-5 flex gap-2 overflow-x-auto pb-0.5">
      {projectNames.map((name) => (
        <button
          key={name}
          onClick={() => onSelect(name)}
          aria-pressed={name === selected}
          className={`min-h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-row font-semibold transition-colors duration-[120ms] ease-std ${
            name === selected
              ? 'bg-paper-0 text-accent-ink'
              : 'bg-paper-0/15 text-paper-0 hover:bg-paper-0/25'
          }`}
        >
          {name.split(' ').slice(0, 2).join(' ')}
        </button>
      ))}
    </div>
  )
}

// ── Ecranul „Azi" ─────────────────────────────────────────────────────────
function DayView({
  tasks,
  selectedProject,
  onReport,
}: {
  tasks: LabourTask[]
  selectedProject: string | null
  onReport: () => void
}) {
  const visible = tasks.filter((t) => t.projectName === selectedProject)

  return (
    <>
      {tasks.length === 0 ? (
        <div className="mx-auto max-w-lg px-4 pt-4">
          <Card className="px-0 py-0">
            <EmptyState title="Nicio echipă pe teren azi">
              Când Pontaj arată manoperă pe un task, el apare aici.
            </EmptyState>
          </Card>
        </div>
      ) : (
        <div className="mx-auto max-w-lg space-y-3 px-4 pb-28 pt-3">
          <div className="rounded-chip border border-line-2 bg-paper-1 px-4 py-3 text-row leading-relaxed text-ink-2">
            <span className="font-semibold text-ink-1">Pontaj spune:</span> azi s-a înregistrat
            manoperă pe {visible.length === 1 ? 'un task' : `${visible.length} taskuri`} din acest
            proiect. Oamenii se gestionează în Pontaj, nu aici. Taskurile fără oameni azi nu sunt
            întrebate.
          </div>

          {visible.map((t) => (
            <Card key={t.taskId} onClick={onReport}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
                  {t.jobName}
                </p>
                <span aria-hidden className="text-ink-4">
                  ›
                </span>
              </div>
              <h2 className="mt-1 text-card font-semibold leading-tight text-ink-1">{t.taskName}</h2>
              <p className="mt-1 text-row text-ink-3">
                {t.workers === 1 ? 'un om azi' : `${num(t.workers)} oameni azi`} · din Pontaj
              </p>
              <div className="mt-2 space-y-1">
                {t.deliverables.map((d) => {
                  const left = Number(d.qty_total) - Number(d.qty_done)
                  if (left <= 0) return null
                  return (
                    <p key={d.id} className="text-row text-ink-3">
                      {d.name} ·{' '}
                      <span className="font-bold text-ink-1">{remaining(left, d.um)}</span>
                    </p>
                  )
                })}
              </div>
            </Card>
          ))}

          {visible.length === 0 && (
            <Card className="px-0 py-0">
              <EmptyState title="Niciun task cu manoperă azi pe acest proiect." />
            </Card>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line-2 bg-paper-2/90 p-4 backdrop-blur-xl">
          {/* 52px înălțime: ținta de atingere de pe telefon, cu mănuși */}
          <PrimaryButton onClick={onReport} className="mx-auto block min-h-13 w-full max-w-lg">
            Închide ziua · {visible.length === 1 ? 'un task' : `${visible.length} taskuri`}
          </PrimaryButton>
        </div>
      )}
    </>
  )
}

// ── Stepper de 52px — degete mari, mănuși, soare în ochi ─────────────────
function Stepper({
  value,
  onChange,
  max,
}: {
  value: number
  onChange: (v: number) => void
  max: number
}) {
  const btn =
    'h-13 w-13 shrink-0 rounded-btn border border-line-2 bg-paper-1 text-stat-sm font-semibold text-ink-1 transition-colors duration-[120ms] ease-std hover:bg-segment active:bg-segment disabled:cursor-not-allowed disabled:bg-paper-1 disabled:text-ink-4'
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Scade"
      >
        −
      </button>
      <span className="w-12 text-center text-stat-sm font-bold tabular-nums text-ink-1">
        {num(value)}
      </span>
      <button
        type="button"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Crește"
      >
        +
      </button>
    </div>
  )
}

// ── Ecranul „Ce s-a construit azi" ────────────────────────────────────────
function ReportView({
  tasks,
  onBack,
  onSaved,
}: {
  tasks: LabourTask[]
  onBack: () => void
  onSaved: () => void
}) {
  const [qty, setQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const totalRows = useMemo(() => Object.values(qty).filter((v) => v > 0).length, [qty])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await closeDay(Object.entries(qty).map(([deliverable_id, q]) => ({ deliverable_id, qty: q })))
      setSaved(true)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (saved) {
    return (
      <div className="min-h-screen bg-paper-2 px-4 pt-16">
        <Card className="mx-auto max-w-lg py-10 text-center">
          <p aria-hidden className="text-stat leading-none text-pos">
            ✓
          </p>
          <h1 className="mt-3 text-[clamp(24px,2.2vw,31px)] leading-none text-ink-1">
            Zi închisă ✓
          </h1>
          <p className="mt-2 text-row text-ink-3">
            Cantitățile au fost salvate și progresul s-a actualizat.
          </p>
          <div className="mt-5 flex justify-center">
            <GhostButton onClick={onBack} className="min-h-10">
              Înapoi la zi
            </GhostButton>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper-2 pb-28">
      <DayBand
        title="Ce s-a construit azi?"
        back={
          <button
            onClick={onBack}
            className="-ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-btn px-1 text-row font-semibold text-paper-0/70 transition-colors duration-[120ms] ease-std hover:text-paper-0"
          >
            <span aria-hidden>←</span> {azi()}
          </button>
        }
      />

      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        {tasks.map((t) => (
          <Card key={t.taskId}>
            <p className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
              {t.jobName}
            </p>
            <h2 className="mt-1 text-card font-semibold text-ink-1">{t.taskName}</h2>
            <div className="mt-3 space-y-3">
              {t.deliverables.map((d) => {
                const left = Math.max(0, Number(d.qty_total) - Number(d.qty_done))
                return (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 border-t border-line-1 pt-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-row font-medium text-ink-1">{d.name}</p>
                      <p className="mt-0.5 text-sub text-ink-3">
                        {left > 0 ? remaining(left, d.um) : 'gata ✓'}
                      </p>
                    </div>
                    <Stepper
                      value={qty[d.id] ?? 0}
                      max={left}
                      onChange={(v) => setQty((old) => ({ ...old, [d.id]: v }))}
                    />
                  </div>
                )
              })}
            </div>
          </Card>
        ))}
        {error && <ErrorStrip message={error} />}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line-2 bg-paper-2/90 p-4 backdrop-blur-xl">
        <PrimaryButton
          onClick={save}
          disabled={busy || totalRows === 0}
          className="mx-auto block min-h-13 w-full max-w-lg"
        >
          {busy ? 'Se salvează…' : 'Salvează ziua'}
        </PrimaryButton>
      </div>
    </div>
  )
}

// ── Ecranul „Progres" — unde suntem · ținta la zi · totalul, fără bani ────
function ProgressJobCard({ job, today }: { job: ProgressJob; today: string }) {
  const [open, setOpen] = useState(false)
  const plan = planPctFn(job.start_date, job.end_date, today)

  return (
    <div className="border-t border-line-1 py-1 first:border-t-0">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between gap-2 rounded-chip text-left transition-colors duration-[120ms] ease-std hover:bg-paper-1"
      >
        <span className="truncate text-row font-semibold text-ink-1">{job.name}</span>
        <span className="flex shrink-0 items-center gap-2 text-row text-ink-3">
          plan {pct(plan)}
          <span
            aria-hidden
            className={`inline-block text-ink-4 transition-transform duration-[120ms] ease-std ${
              open ? 'rotate-90' : ''
            }`}
          >
            ›
          </span>
        </span>
      </button>

      {open && (
        <div className="mb-2 mt-2 space-y-2">
          {job.tasks.map((t) => {
            const tp = taskPct(
              t.deliverables.map((d) => ({
                qtyTotal: Number(d.qty_total),
                qtyDone: Number(d.qty_done),
                weight: Number(d.weight),
              }))
            )
            return (
              <div key={t.id} className="rounded-chip bg-paper-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-row font-semibold text-ink-1">{t.name}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={t.status} />
                    <span className="text-row font-bold tabular-nums text-ink-1">{pct(tp)}</span>
                  </div>
                </div>
                <div className="mt-2.5 space-y-2.5">
                  {t.deliverables.map((d) => {
                    const total = Number(d.qty_total)
                    const done = Number(d.qty_done)
                    // ținta la zi: cât AR TREBUI să fie construit conform planului jobului
                    const target = Math.round(plan * total)
                    return (
                      <div key={d.id}>
                        <div className="flex items-baseline justify-between gap-2 text-row">
                          <span className="truncate text-ink-3">{d.name}</span>
                          <span className="shrink-0 tabular-nums text-ink-2">
                            <span className="font-bold text-ink-1">{num(done)}</span>
                            <span className="text-ink-3"> / țintă {num(target)} / </span>
                            {num(total)} {d.um}
                          </span>
                        </div>
                        <ProgressBar
                          donePct={deliverablePct(done, total)}
                          planPct={plan}
                          className="mt-1.5"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProgressView() {
  const { projects, loading, error } = useSkeletonProgress()
  const today = todayIso()

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 pb-10 pt-3">
        {[0, 1].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-3 h-2 w-full" />
            <Skeleton className="mt-4 h-3.5 w-32" />
            <Skeleton className="mt-2.5 h-3.5 w-24" />
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-10 pt-3">
        <ErrorStrip message={`Eroare: ${error}`} />
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-10 pt-3">
        <Card className="px-0 py-0">
          <EmptyState title="Niciun proiect activ">
            Proiectele active apar aici cu progresul lor.
          </EmptyState>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-10 pt-3">
      {projects.map((p) => {
        const prog = projectProgress(p, today)
        return (
          <Card key={p.id}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="min-w-0 truncate text-card font-semibold leading-tight text-ink-1">
                {p.name}
              </h2>
              <span className="shrink-0 text-row tabular-nums text-ink-3">
                <span className="font-bold text-ink-1">{pct(prog.donePct)}</span> · plan{' '}
                {pct(prog.planPct)}
              </span>
            </div>
            <ProgressBar donePct={prog.donePct} planPct={prog.planPct} className="mt-2.5" />
            <div className="mt-3">
              {p.jobs.map((j) => (
                <ProgressJobCard key={j.id} job={j} today={today} />
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

// ── Containerul Șantier ───────────────────────────────────────────────────
const SCREEN_OPTIONS: { value: 'day' | 'progress'; label: string }[] = [
  { value: 'day', label: 'Azi' },
  { value: 'progress', label: 'Progres' },
]

export function SantierView({ onDataChanged }: { onDataChanged?: () => void }) {
  const { tasks, loading, error, refetch } = useLabourToday()
  const { projects: skeleton } = useSkeletonProgress()
  const [screen, setScreen] = useState<'day' | 'report' | 'progress'>('day')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)

  const projectNames = useMemo(() => [...new Set(tasks.map((t) => t.projectName))], [tasks])
  const selected = projectFilter ?? projectNames[0] ?? null
  const today = todayIso()

  const progress = useMemo(() => {
    if (!selected) return null
    const p = skeleton.find((x) => x.name === selected)
    return p ? projectProgress(p, today) : null
  }, [skeleton, selected, today])

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-2">
        {/* data e cunoscută din prima, deci banda nu clipește */}
        <DayBand caption="Șantier · raport zilnic" title={azi()} />
        <div className="mx-auto max-w-lg space-y-3 px-4 pt-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2.5 h-4 w-48" />
              <Skeleton className="mt-2.5 h-3.5 w-32" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-paper-2">
        <DayBand caption="Șantier · raport zilnic" title={azi()} />
        <div className="mx-auto max-w-lg px-4 pt-4">
          <ErrorStrip message={`Eroare: ${error}`} onRetry={refetch} />
        </div>
      </div>
    )
  }

  if (screen === 'report') {
    return (
      <ReportView
        tasks={tasks.filter((t) => t.projectName === selected)}
        onBack={() => {
          setScreen('day')
          refetch()
        }}
        onSaved={() => {
          // KPI-urile de birou (Proiecte) se recalculează imediat după salvare
          onDataChanged?.()
        }}
      />
    )
  }

  return (
    <div className="min-h-screen bg-paper-2">
      {screen === 'day' ? (
        <DayBand caption="Șantier · raport zilnic" title={azi()}>
          {projectNames.length > 0 && (
            <ProjectChips
              projectNames={projectNames}
              selected={selected}
              onSelect={setProjectFilter}
            />
          )}
        </DayBand>
      ) : (
        <DayBand caption="Șantier · progres lucrări" title="Unde suntem?">
          <p className="mt-1.5 text-sub text-paper-0/70">realizat · ținta la zi · totalul</p>
        </DayBand>
      )}

      <div className="mx-auto max-w-lg px-4 pt-4">
        <SegmentedControl
          options={SCREEN_OPTIONS}
          value={screen === 'progress' ? 'progress' : 'day'}
          onChange={(s) => setScreen(s)}
          className={SEG_ON_PHONE}
        />
      </div>

      {screen === 'day' ? (
        <>
          {progress && selected && (
            <div className="mx-auto max-w-lg px-4 pt-3">
              <Card>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-card font-semibold text-ink-1">
                    {selected}
                  </span>
                  <span className="shrink-0 text-row tabular-nums text-ink-3">
                    <span className="font-bold text-ink-1">{pct(progress.donePct)}</span> · plan{' '}
                    {pct(progress.planPct)}
                  </span>
                </div>
                <ProgressBar
                  donePct={progress.donePct}
                  planPct={progress.planPct}
                  className="mt-2.5"
                />
              </Card>
            </div>
          )}
          <DayView tasks={tasks} selectedProject={selected} onReport={() => setScreen('report')} />
        </>
      ) : (
        <ProgressView />
      )}
    </div>
  )
}
