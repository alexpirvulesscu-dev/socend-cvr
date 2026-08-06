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
  type AllocRow,
  closeDay,
  countWorkers,
  type LabourProject,
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

/** „un om" / „4 oameni" — forma corectă, folosită peste tot pe șantier. */
function oameni(n: number): string {
  return n === 1 ? 'un om' : `${num(n)} oameni`
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

/* Comutatorul de proiecte (pastilele din bandă) a fost înlocuit de desfășurarea
   proiect → job → task: navigarea se face acum din carduri, nu din pastile. */

// ── Ecranul „Azi" — se desfășoară: proiect → joburi → taskuri ─────────────
// Regula de citire: fiecare card arată oamenii de la NIVELUL lui, numărați o
// singură dată. Un om trimis pe proiect se vede pe cardul proiectului, nu
// repetat pe fiecare job și task de dedesubt (așa părea că sunt de trei ori
// mai mulți oameni pe șantier decât sunt).

/** Un rând de listă cu titlu, subtitlu și săgeată — cardul de navigare. */
function DrillCard({
  caption,
  title,
  sub,
  onClick,
}: {
  caption?: string
  title: string
  sub?: string
  onClick?: () => void
}) {
  return (
    <Card onClick={onClick}>
      <div className="flex items-center justify-between gap-2">
        {caption ? (
          <p className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">{caption}</p>
        ) : (
          <span />
        )}
        {onClick && (
          <span aria-hidden className="text-ink-4">
            ›
          </span>
        )}
      </div>
      <h2 className="mt-1 text-card font-semibold leading-tight text-ink-1">{title}</h2>
      {sub && <p className="mt-1 text-row text-ink-3">{sub}</p>}
    </Card>
  )
}

/** Nivelul 1 — proiectele pe care sunt oameni azi. */
function ProjectList({
  skeleton,
  labourProjects,
  alloc,
  onOpen,
}: {
  skeleton: ProgressProject[]
  labourProjects: LabourProject[]
  alloc: AllocRow[]
  onOpen: (projectId: string) => void
}) {
  const projectIds = useMemo(() => [...new Set(alloc.map((a) => a.projectId))], [alloc])

  if (projectIds.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-4">
        <Card className="px-0 py-0">
          <EmptyState title="Nicio echipă pe teren azi">
            Când Pontaj trimite oameni pe un proiect, el apare aici.
          </EmptyState>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3">
      {projectIds.map((pid) => {
        const p = skeleton.find((x) => x.id === pid)
        const flat = labourProjects.find((x) => x.projectId === pid)
        const total = countWorkers(alloc, { projectId: pid })
        const hasJobs = (p?.jobs.length ?? 0) > 0
        const name = p?.name ?? flat?.projectName ?? 'Proiect'

        // Proiect fără joburi: orele stau pe proiect, ca întreg — nu e nimic de
        // desfășurat, deci cardul nu se deschide, doar spune unde suntem.
        if (!hasJobs) {
          return (
            <DrillCard
              key={pid}
              caption="Urmărit pe proiect"
              title={name}
              sub={`${oameni(total)} azi${
                flat && flat.hours > 0 ? ` · ${num(flat.hours)} ore până acum` : ''
              }`}
            />
          )
        }

        const onProject = countWorkers(alloc, { projectId: pid, jobId: null, taskId: null })
        return (
          <DrillCard
            key={pid}
            caption={`${p!.jobs.length === 1 ? 'un job' : `${num(p!.jobs.length)} joburi`}`}
            title={name}
            sub={`${oameni(total)} azi${
              onProject > 0 ? ` · ${oameni(onProject)} pe proiect, fără job` : ''
            }`}
            onClick={() => onOpen(pid)}
          />
        )
      })}
    </div>
  )
}

/** Nivelul 2 — joburile proiectului. */
function JobList({
  project,
  alloc,
  onOpen,
}: {
  project: ProgressProject
  alloc: AllocRow[]
  onOpen: (jobId: string) => void
}) {
  const onProject = countWorkers(alloc, { projectId: project.id, jobId: null, taskId: null })

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3">
      {onProject > 0 && (
        <div className="rounded-chip border border-line-2 bg-paper-1 px-4 py-3 text-row leading-relaxed text-ink-2">
          <span className="font-semibold text-ink-1">{oameni(onProject)}</span> sunt trimiși pe
          proiect, fără job anume. Repartizarea pe job sau task se face în Pontaj.
        </div>
      )}
      {project.jobs.map((j) => {
        const workers = countWorkers(alloc, { projectId: project.id, jobId: j.id })
        return (
          <DrillCard
            key={j.id}
            caption={j.tasks.length === 1 ? 'un task' : `${num(j.tasks.length)} taskuri`}
            title={j.name}
            sub={workers > 0 ? `${oameni(workers)} azi pe acest job` : 'niciun om azi pe acest job'}
            onClick={() => onOpen(j.id)}
          />
        )
      })}
      {project.jobs.length === 0 && (
        <Card className="px-0 py-0">
          <EmptyState title="Proiectul nu are joburi în CVR." />
        </Card>
      )}
    </div>
  )
}

/** Nivelul 3 — taskurile jobului, cu ce a mai rămas de construit. */
function TaskList({
  project,
  job,
  alloc,
  onOpen,
}: {
  project: ProgressProject
  job: ProgressJob
  alloc: AllocRow[]
  onOpen: (taskId: string) => void
}) {
  const onJob = countWorkers(alloc, { projectId: project.id, jobId: job.id, taskId: null })

  return (
    <div className="mx-auto max-w-lg space-y-3 px-4 pb-8 pt-3">
      {onJob > 0 && (
        <div className="rounded-chip border border-line-2 bg-paper-1 px-4 py-3 text-row leading-relaxed text-ink-2">
          <span className="font-semibold text-ink-1">{oameni(onJob)}</span> sunt trimiși pe job,
          fără task anume. Poți raporta pe oricare task de mai jos.
        </div>
      )}
      {job.tasks.map((t) => {
        const workers = countWorkers(alloc, { taskId: t.id })
        const left = t.deliverables.reduce(
          (s, d) => s + Math.max(0, Number(d.qty_total) - Number(d.qty_done)),
          0
        )
        const sub =
          t.deliverables.length === 0
            ? 'fără livrabile în CVR'
            : workers > 0
              ? `${oameni(workers)} azi pe acest task`
              : left > 0
                ? `${num(t.deliverables.length)} livrabile de raportat`
                : 'totul raportat ✓'
        return (
          <DrillCard
            key={t.id}
            caption={t.status === 'in_lucru' ? 'în lucru' : t.status === 'finalizat' ? 'finalizat' : 'neînceput'}
            title={t.name}
            sub={sub}
            onClick={() => onOpen(t.id)}
          />
        )
      })}
      {job.tasks.length === 0 && (
        <Card className="px-0 py-0">
          <EmptyState title="Jobul nu are taskuri în CVR." />
        </Card>
      )}
    </div>
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

// ── Ecranul „Ce s-a construit azi" — un task pe ecran, cu sărit între ele ──
// Cantitățile introduse se păstrează cât timp treci de la un task la altul și
// se salvează toate odată, la final.
function ReportView({
  job,
  startTaskId,
  onBack,
  onSaved,
}: {
  job: ProgressJob
  startTaskId: string
  onBack: () => void
  onSaved: () => void
}) {
  const [idx, setIdx] = useState(() => Math.max(0, job.tasks.findIndex((t) => t.id === startTaskId)))
  const [qty, setQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const task = job.tasks[idx]
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
        {/* Sări de la un task la altul fără să pierzi ce ai introdus */}
        <div className="flex items-center justify-between gap-2">
          <GhostButton
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="min-h-10"
          >
            ‹ Taskul anterior
          </GhostButton>
          <span className="shrink-0 text-sub text-ink-3">
            {num(idx + 1)} din {num(job.tasks.length)}
          </span>
          <GhostButton
            onClick={() => setIdx((i) => Math.min(job.tasks.length - 1, i + 1))}
            disabled={idx >= job.tasks.length - 1}
            className="min-h-10"
          >
            Taskul următor ›
          </GhostButton>
        </div>

        <Card>
          <p className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">{job.name}</p>
          <h2 className="mt-1 text-card font-semibold text-ink-1">{task.name}</h2>

          {task.deliverables.length === 0 ? (
            <p className="mt-3 border-t border-line-1 pt-3 text-row leading-relaxed text-ink-2">
              Taskul nu are livrabile în CVR, deci nu există cantități de raportat. Livrabilele
              (ce se măsoară și cât e total) se adaugă de la birou, în configurarea proiectului.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {task.deliverables.map((d) => {
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
          )}
        </Card>
        {error && <ErrorStrip message={error} />}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line-2 bg-paper-2/90 p-4 backdrop-blur-xl">
        <PrimaryButton
          onClick={save}
          disabled={busy || totalRows === 0}
          className="mx-auto block min-h-13 w-full max-w-lg"
        >
          {busy
            ? 'Se salvează…'
            : totalRows === 0
              ? 'Salvează ziua'
              : `Salvează ziua · ${totalRows === 1 ? 'o cantitate' : `${num(totalRows)} cantități`}`}
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
  const { projects: labourProjects, alloc, loading, error, refetch } = useLabourToday()
  const { projects: skeleton } = useSkeletonProgress()
  const [screen, setScreen] = useState<'day' | 'report' | 'progress'>('day')
  // Unde suntem în desfășurare: nimic = lista de proiecte, apoi job, apoi task.
  const [openProject, setOpenProject] = useState<string | null>(null)
  const [openJob, setOpenJob] = useState<string | null>(null)
  const [openTask, setOpenTask] = useState<string | null>(null)

  const today = todayIso()

  const project = useMemo(
    () => (openProject ? (skeleton.find((p) => p.id === openProject) ?? null) : null),
    [skeleton, openProject]
  )
  const job = useMemo(
    () => (project && openJob ? (project.jobs.find((j) => j.id === openJob) ?? null) : null),
    [project, openJob]
  )
  const progress = useMemo(
    () => (project ? projectProgress(project, today) : null),
    [project, today]
  )

  function backToProjects() {
    setOpenProject(null)
    setOpenJob(null)
    setOpenTask(null)
  }

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

  if (screen === 'report' && job && openTask) {
    return (
      <ReportView
        job={job}
        startTaskId={openTask}
        onBack={() => {
          setScreen('day')
          setOpenTask(null)
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
        // Titlul benzii spune unde ești: ziua → proiectul → jobul. Întoarcerea
        // urcă un singur nivel, ca pe telefon să nu te pierzi.
        <DayBand
          caption={project ? undefined : 'Șantier · raport zilnic'}
          title={job ? job.name : (project?.name ?? azi())}
          back={
            project ? (
              <button
                onClick={() => (job ? setOpenJob(null) : backToProjects())}
                className="-ml-1 inline-flex min-h-10 items-center gap-1.5 rounded-btn px-1 text-row font-semibold text-paper-0/70 transition-colors duration-[120ms] ease-std hover:text-paper-0"
              >
                <span aria-hidden>←</span> {job ? project.name : azi()}
              </button>
            ) : undefined
          }
        />
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
          {progress && project && (
            <div className="mx-auto max-w-lg px-4 pt-3">
              <Card>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-card font-semibold text-ink-1">
                    {project.name}
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
          {!project ? (
            <ProjectList
              skeleton={skeleton}
              labourProjects={labourProjects}
              alloc={alloc}
              onOpen={(id) => {
                setOpenProject(id)
                setOpenJob(null)
              }}
            />
          ) : !job ? (
            <JobList project={project} alloc={alloc} onOpen={(id) => setOpenJob(id)} />
          ) : (
            <TaskList
              project={project}
              job={job}
              alloc={alloc}
              onOpen={(id) => {
                setOpenTask(id)
                setScreen('report')
              }}
            />
          )}
        </>
      ) : (
        <ProgressView />
      )}
    </div>
  )
}
