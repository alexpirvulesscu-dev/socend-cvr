// Ecranele de șantier (mobile first, pentru Mihai):
//  1. „Azi" — header teal (#115468, cerut la review), comutator de proiect,
//     „Pontaj spune", un card pe task cu manoperă azi, „Închide ziua".
//  2. „Ce s-a construit azi" — un rând pe livrabil cu steppere de 52px,
//     „Salvează ziua" → RPC atomic → „Zi închisă ✓".
//  3. „Progres" — toată ierarhia (proiect → job → task → livrabil), FĂRĂ bani:
//     unde suntem, ținta la zi și totalul, pentru fiecare livrabil.
import { useMemo, useState } from 'react'
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
import { Card, ProgressBar, StatusPill } from '../components/ui'

const HEADER_BG = 'bg-[#115468]'

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
  const k = projectKpis(jobs, { depus: 0, certificat: 0, facturat: 0, incasat: 0 }, today)
  return { donePct: k.donePct, planPct: k.planPct }
}

// ── Header-ul de zi (teal, singurul loc cu accentul galben) ───────────────
function DayHeader({
  projectNames,
  selected,
  onSelect,
  progress,
}: {
  projectNames: string[]
  selected: string | null
  onSelect: (name: string) => void
  progress: { donePct: number; planPct: number } | null
}) {
  return (
    <div className={`${HEADER_BG} px-4 pb-5 pt-5 text-white`}>
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-white/60">Șantier · raport zilnic</p>
        <h1 className="mt-1 text-2xl font-semibold">{azi()}</h1>

        {projectNames.length > 0 && (
          <div className="mt-4 flex gap-2 overflow-x-auto">
            {projectNames.map((name) => (
              <button
                key={name}
                onClick={() => onSelect(name)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  name === selected
                    ? 'bg-[#E2E04A] text-[#0D1A2D]'
                    : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {name.split(' ').slice(0, 2).join(' ')}
              </button>
            ))}
          </div>
        )}

        {progress && selected && (
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="truncate">{selected}</span>
              <span className="shrink-0 font-semibold">
                {pct(progress.donePct)} · plan {pct(progress.planPct, 0)}
              </span>
            </div>
            <div className="relative mt-2 h-2 rounded-full bg-white/20">
              <div
                className="h-2 rounded-full bg-[#E2E04A]"
                style={{ width: `${Math.min(progress.donePct, 1) * 100}%` }}
              />
              <div
                className="absolute -top-1 h-4 w-0.5 rounded bg-white"
                style={{ left: `calc(${Math.min(progress.planPct, 1) * 100}% - 1px)` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Comutatorul Azi / Progres. */
function ScreenToggle({
  screen,
  onScreen,
}: {
  screen: 'day' | 'progress'
  onScreen: (s: 'day' | 'progress') => void
}) {
  const seg = (active: boolean) =>
    `flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
      active ? 'bg-white text-[#0D1A2D] shadow-[0_1px_2px_rgba(13,26,45,0.1)]' : 'text-[#5B6673]'
    }`
  return (
    <div className="mx-auto mt-4 flex max-w-lg gap-1 rounded-full bg-[#EEECE7] p-1">
      <button className={seg(screen === 'day')} onClick={() => onScreen('day')}>
        Azi
      </button>
      <button className={seg(screen === 'progress')} onClick={() => onScreen('progress')}>
        Progres
      </button>
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
        <Card className="mx-auto mt-4 max-w-lg py-10 text-center">
          <p className="font-medium">Nicio echipă pe teren azi</p>
          <p className="mt-1 text-sm text-[#5B6673]">
            Când Pontaj arată manoperă pe un task, el apare aici.
          </p>
        </Card>
      ) : (
        <div className="mx-auto max-w-lg space-y-3 px-4 pb-28 pt-4">
          <div className="rounded-2xl bg-[#E3EDF3] px-4 py-3 text-sm leading-relaxed text-[#115468]">
            <strong>Pontaj spune:</strong> azi s-a înregistrat manoperă pe{' '}
            {visible.length === 1 ? 'un task' : `${visible.length} taskuri`} din acest proiect.
            Oamenii se gestionează în Pontaj, nu aici. Taskurile fără oameni azi nu sunt
            întrebate.
          </div>

          {visible.map((t) => (
            <Card
              key={t.taskId}
              onClick={onReport}
              className="space-y-1 transition-transform duration-150 hover:translate-x-0.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                  {t.jobName}
                </p>
                <span aria-hidden className="text-[#C9C5BC]">
                  ›
                </span>
              </div>
              <h2 className="font-semibold leading-tight">{t.taskName}</h2>
              <p className="text-sm text-[#5B6673]">
                {t.workers === 1 ? 'un om azi' : `${num(t.workers)} oameni azi`} · din Pontaj
              </p>
              <div className="space-y-0.5 pt-1">
                {t.deliverables.map((d) => {
                  const left = Number(d.qty_total) - Number(d.qty_done)
                  if (left <= 0) return null
                  return (
                    <p key={d.id} className="text-sm text-[#5B6673]">
                      {d.name} · <strong className="text-[#0D1A2D]">{remaining(left, d.um)}</strong>
                    </p>
                  )
                })}
              </div>
            </Card>
          ))}

          {visible.length === 0 && (
            <Card className="py-8 text-center">
              <p className="text-sm text-[#5B6673]">Niciun task cu manoperă azi pe acest proiect.</p>
            </Card>
          )}
        </div>
      )}

      {visible.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.9)] p-4 backdrop-blur-xl">
          <button
            onClick={onReport}
            className="mx-auto block w-full max-w-lg rounded-2xl bg-[#58A834] py-4 text-base font-semibold text-white hover:bg-[#46862A]"
          >
            Închide ziua · {visible.length === 1 ? 'un task' : `${visible.length} taskuri`}
          </button>
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
    'h-[52px] w-[52px] shrink-0 rounded-2xl bg-[#EEECE7] text-2xl font-semibold text-[#0D1A2D] active:bg-[#E2DFD8] disabled:opacity-30'
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
      <span className="w-12 text-center text-lg font-semibold tabular-nums">{num(value)}</span>
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
      <div className="min-h-screen bg-[#FAF9F6] px-4 pt-16">
        <Card className="mx-auto max-w-lg space-y-2 py-10 text-center">
          <p className="text-4xl text-[#58A834]">✓</p>
          <h1 className="text-xl font-semibold text-[#46862A]">Zi închisă ✓</h1>
          <p className="text-sm text-[#5B6673]">
            Cantitățile au fost salvate și progresul s-a actualizat.
          </p>
          <button
            onClick={onBack}
            className="mx-auto mt-4 block rounded-full bg-[#EEECE7] px-6 py-3 text-sm font-medium"
          >
            Înapoi la zi
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-28">
      <div className={`${HEADER_BG} px-4 pb-5 pt-5 text-white`}>
        <div className="mx-auto max-w-lg">
          <button onClick={onBack} className="text-sm text-white/60">
            ← {azi()}
          </button>
          <h1 className="mt-1 text-2xl font-semibold">Ce s-a construit azi?</h1>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        {tasks.map((t) => (
          <Card key={t.taskId} className="space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                {t.jobName}
              </p>
              <h2 className="font-semibold">{t.taskName}</h2>
            </div>
            {t.deliverables.map((d) => {
              const left = Math.max(0, Number(d.qty_total) - Number(d.qty_done))
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 border-t border-[#F3F1EC] pt-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-[#5B6673]">
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
          </Card>
        ))}
        {error && <p className="text-sm text-[#D64545]">{error}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.9)] p-4 backdrop-blur-xl">
        <button
          onClick={save}
          disabled={busy || totalRows === 0}
          className="mx-auto block w-full max-w-lg rounded-2xl bg-[#58A834] py-4 text-base font-semibold text-white hover:bg-[#46862A] disabled:opacity-40"
        >
          {busy ? 'Se salvează…' : 'Salvează ziua'}
        </button>
      </div>
    </div>
  )
}

// ── Ecranul „Progres" — unde suntem · ținta la zi · totalul, fără bani ────
function ProgressJobCard({ job, today }: { job: ProgressJob; today: string }) {
  const [open, setOpen] = useState(false)
  const plan = planPctFn(job.start_date, job.end_date, today)

  return (
    <div className="border-t border-[#F3F1EC] py-3 first:border-t-0 first:pt-0 last:pb-0">
      <button onClick={() => setOpen((o) => !o)} className="block w-full text-left">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{job.name}</span>
          <span className="flex items-center gap-2 text-sm text-[#5B6673]">
            plan {pct(plan, 0)}
            <span
              aria-hidden
              className={`inline-block text-[#C9C5BC] transition-transform ${open ? 'rotate-90' : ''}`}
            >
              ›
            </span>
          </span>
        </div>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {job.tasks.map((t) => {
            const tp = taskPct(
              t.deliverables.map((d) => ({
                qtyTotal: Number(d.qty_total),
                qtyDone: Number(d.qty_done),
                weight: Number(d.weight),
              }))
            )
            return (
              <div key={t.id} className="rounded-2xl bg-[#FAF9F6] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{t.name}</p>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill status={t.status} />
                    <span className="text-sm font-semibold">{pct(tp, 0)}</span>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  {t.deliverables.map((d) => {
                    const total = Number(d.qty_total)
                    const done = Number(d.qty_done)
                    // ținta la zi: cât AR TREBUI să fie construit conform planului jobului
                    const target = Math.round(plan * total)
                    return (
                      <div key={d.id}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="truncate text-[#5B6673]">{d.name}</span>
                          <span className="shrink-0 tabular-nums">
                            <strong>{num(done)}</strong>
                            <span className="text-[#5B6673]"> / țintă {num(target)} / </span>
                            {num(total)} {d.um}
                          </span>
                        </div>
                        <ProgressBar
                          donePct={deliverablePct(done, total)}
                          planPct={plan}
                          className="mt-1"
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

  if (loading) return <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
  if (error) return <p className="p-8 text-center text-sm text-[#D64545]">Eroare: {error}</p>

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 pb-10 pt-4">
      {projects.map((p) => {
        const prog = projectProgress(p, today)
        return (
          <Card key={p.id} className="space-y-3">
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-semibold leading-tight">{p.name}</h2>
                <span className="shrink-0 text-sm font-semibold">
                  {pct(prog.donePct)} <span className="font-normal text-[#5B6673]">· plan {pct(prog.planPct, 0)}</span>
                </span>
              </div>
              <ProgressBar donePct={prog.donePct} planPct={prog.planPct} className="mt-2" />
            </div>
            <div>
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

  if (loading) return <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
  if (error) return <p className="p-8 text-center text-sm text-[#D64545]">Eroare: {error}</p>

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
    <div className="min-h-screen bg-[#FAF9F6]">
      {screen === 'day' ? (
        <DayHeader
          projectNames={projectNames}
          selected={selected}
          onSelect={setProjectFilter}
          progress={progress}
        />
      ) : (
        <div className={`${HEADER_BG} px-4 pb-5 pt-5 text-white`}>
          <div className="mx-auto max-w-lg">
            <p className="text-sm text-white/60">Șantier · progres lucrări</p>
            <h1 className="mt-1 text-2xl font-semibold">Unde suntem?</h1>
            <p className="mt-1 text-sm text-white/60">realizat · ținta la zi · totalul</p>
          </div>
        </div>
      )}

      <div className="px-4">
        <ScreenToggle
          screen={screen === 'progress' ? 'progress' : 'day'}
          onScreen={(s) => setScreen(s)}
        />
      </div>

      {screen === 'day' ? (
        <DayView tasks={tasks} selectedProject={selected} onReport={() => setScreen('report')} />
      ) : (
        <ProgressView />
      )}
    </div>
  )
}
