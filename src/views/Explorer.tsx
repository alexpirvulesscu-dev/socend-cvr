// Explorer v3 — ecranul UNIC de birou: coloane Miller (Finder-style).
// Calea Proiect → Job → Task e vizibilă dintr-o privire; coloanele apar pe
// măsură ce cobori, iar panoul din dreapta (Detaliu) arată și editează nivelul
// selectat. Editarea e inline + optimistă: patch local imediat, persistare în
// fundal, revert + toast la eroare.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { JobWithKpis, ProjectWithKpis, TaskRow } from '../data/projects'
import type { EntityPatch } from '../data/projects'
import { addJob, addTask, setJobsOrder, setProjectsOrder, setTasksOrder } from '../data/mutations'
import { taskPct } from '../domain/kpi'
import { compact, dataRo, pct, toNum } from '../lib/format'
import { KpiPill, ProgressBar, StatusPill, scheduleText } from '../components/ui'
import { toast } from '../components/Toast'
import type { Selection } from '../lib/selection'
import { KpiBand } from './ExplorerKpis'
import { DetailPanel } from './ExplorerDetail'
import { GanttChart } from '../components/gantt/GanttChart'
import { todayIso } from '../data/projects'
import { scheduleColor } from '../domain/kpi'

// ── Salvarea optimistă: patch → persistă; la eroare: revert + toast ──────
export type Save = (apply: EntityPatch, revert: EntityPatch, persist: () => Promise<void>) => void

export function makeSave(patchEntity: (p: EntityPatch) => void): Save {
  return (apply, revert, persist) => {
    patchEntity(apply)
    persist().catch((e: Error) => {
      patchEntity(revert)
      toast(`Nu s-a salvat: ${e.message}`)
    })
  }
}

// ── Drag & drop generic în coloană (linia verde de inserție din v2) ──────
function useDragOrder(ids: string[], onCommit: (next: string[]) => void) {
  const [order, setOrder] = useState<string[]>(ids)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const key = ids.join(',')
  useEffect(() => {
    setOrder(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function drop() {
    if (dragId && overId) {
      setOrder((old) => {
        const next = old.filter((id) => id !== dragId)
        if (overId === '__end__') next.push(dragId)
        else next.splice(next.indexOf(overId), 0, dragId)
        onCommit(next)
        return next
      })
    }
    setDragId(null)
    setOverId(null)
  }

  return { order, dragId, overId, setDragId, setOverId, drop }
}

/** Linia verde de inserție (identică vizual cu cea din v2). */
function InsertLine() {
  return (
    <div className="pointer-events-none absolute -top-1.5 left-0 right-0 z-10 flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-[#58A834]" />
      <span className="h-1 flex-1 rounded-full bg-[#58A834]" />
    </div>
  )
}

// ── Coloana generică ─────────────────────────────────────────────────────
function Column({
  title,
  action,
  children,
  width,
  className = '',
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  width: string
  className?: string
}) {
  return (
    <div className={`min-h-0 ${width} shrink-0 flex-col ${className || 'flex'}`}>
      <div className="mb-2 flex h-8 items-center justify-between px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
          {title}
        </h2>
        {action}
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto rounded-2xl bg-white/60 p-1.5 shadow-[0_1px_2px_rgba(13,26,45,0.03)]">
        {children}
      </div>
    </div>
  )
}

/** Rând de coloană: alb+umbră când e selectat, hover discret altfel. */
function Row({
  selected,
  onClick,
  draggableProps,
  showLine,
  dimmed,
  children,
}: {
  selected: boolean
  onClick: () => void
  draggableProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
  showLine?: boolean
  dimmed?: boolean
  children: ReactNode
}) {
  return (
    <div className="relative" {...draggableProps}>
      {showLine && <InsertLine />}
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            onClick()
          }
        }}
        className={`cursor-pointer rounded-xl px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#58A834] ${
          selected
            ? 'bg-white shadow-[0_1px_2px_rgba(13,26,45,0.05),0_4px_12px_rgba(13,26,45,0.07)]'
            : 'hover:bg-white/80'
        } ${dimmed ? 'opacity-60' : ''}`}
      >
        {children}
      </div>
    </div>
  )
}

/** Butonul rotund verde „+ Adaugă" al coloanelor. */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-[#DDEDDC] px-3 py-1 text-xs font-medium text-[#46862A] hover:bg-[#CBE3C9]"
    >
      {label}
    </button>
  )
}

const addInputCls =
  'w-full rounded-lg border border-[#E8E8E8] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#58A834]'

// ── Coloana 1 · Proiecte ─────────────────────────────────────────────────
function ProjectRow({ p, selected, showValue }: { p: ProjectWithKpis; selected: boolean; showValue?: boolean }) {
  const k = p.kpis
  return (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`truncate text-sm ${selected ? 'font-semibold' : 'font-medium'}`}>
          {p.name}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{pct(k.donePct, 0)}</span>
      </div>
      {showValue !== false && (
        <p className="mt-0.5 truncate text-xs text-[#5B6673]">
          {p.client ? `${p.client} · ` : ''}
          {compact(Number(p.contract_value))} lei
        </p>
      )}
      <ProgressBar donePct={k.donePct} planPct={k.planPct} className="mt-1.5 !h-1.5" />
      {k.behindDays >= 2 && (
        <div className="mt-1.5">
          <KpiPill color={scheduleColor(k.behindDays)}>{scheduleText(k.behindDays)}</KpiPill>
        </div>
      )}
    </>
  )
}

function ProjectsColumn({
  projects,
  sel,
  onSelect,
  onNew,
  className,
}: {
  projects: ProjectWithKpis[]
  sel: Selection
  onSelect: (projectId: string | undefined) => void
  onNew: () => void
  className?: string
}) {
  const mainActive = useMemo(() => projects.filter((p) => p.active && !p.is_small), [projects])
  const smallActive = useMemo(() => projects.filter((p) => p.active && p.is_small), [projects])
  const done = useMemo(() => projects.filter((p) => !p.active), [projects])
  const [showSmall, setShowSmall] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const dnd = useDragOrder(
    mainActive.map((p) => p.id),
    (next) =>
      void setProjectsOrder([
        ...next,
        ...smallActive.map((p) => p.id),
        ...done.map((p) => p.id),
      ]).catch((e: Error) => toast(`Ordinea nu s-a salvat: ${e.message}`))
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as ProjectWithKpis[]

  // auto-deschide grupul care conține proiectul selectat
  useEffect(() => {
    if (!sel.projectId) return
    const p = byId.get(sel.projectId)
    if (p && p.active && p.is_small) setShowSmall(true)
    if (p && !p.active) setShowDone(true)
  }, [sel.projectId, byId])

  return (
    <Column
      title={`Proiecte (${mainActive.length})`}
      width="w-[270px]"
      className={className}
      action={<AddButton label="+ Proiect" onClick={onNew} />}
    >
      <div onDragOver={(e) => e.preventDefault()} onDrop={dnd.drop}>
        {ordered.map((p) => (
          <Row
            key={p.id}
            selected={sel.projectId === p.id}
            onClick={() => onSelect(sel.projectId === p.id ? undefined : p.id)}
            showLine={dnd.dragId !== null && dnd.overId === p.id && dnd.dragId !== p.id}
            draggableProps={{
              draggable: true,
              onDragStart: () => dnd.setDragId(p.id),
              onDragOver: (e) => {
                e.preventDefault()
                if (dnd.dragId && dnd.dragId !== p.id) dnd.setOverId(p.id)
              },
              onDragEnd: dnd.drop,
              className: `relative pb-1 ${dnd.dragId === p.id ? 'opacity-40' : ''}`,
            }}
          >
            <ProjectRow p={p} selected={sel.projectId === p.id} />
          </Row>
        ))}
        {dnd.dragId !== null && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              dnd.setOverId('__end__')
            }}
            className="relative h-6"
          >
            {dnd.overId === '__end__' && <InsertLine />}
          </div>
        )}
      </div>

      {mainActive.length === 0 && (
        <p className="px-3 py-6 text-center text-xs text-[#5B6673]">
          Niciun proiect activ. Apasă „+ Proiect".
        </p>
      )}

      {smallActive.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowSmall((s) => !s)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-[#5B6673] hover:bg-white/80"
          >
            <span>Proiecte mici ({smallActive.length})</span>
            <span aria-hidden className={`transition-transform ${showSmall ? 'rotate-90' : ''}`}>
              ›
            </span>
          </button>
          {showSmall &&
            smallActive.map((p) => (
              <Row
                key={p.id}
                selected={sel.projectId === p.id}
                onClick={() => onSelect(sel.projectId === p.id ? undefined : p.id)}
              >
                <ProjectRow p={p} selected={sel.projectId === p.id} />
              </Row>
            ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold text-[#5B6673] hover:bg-white/80"
          >
            <span>Finalizate ({done.length})</span>
            <span aria-hidden className={`transition-transform ${showDone ? 'rotate-90' : ''}`}>
              ›
            </span>
          </button>
          {showDone &&
            done.map((p) => (
              <Row
                key={p.id}
                selected={sel.projectId === p.id}
                onClick={() => onSelect(sel.projectId === p.id ? undefined : p.id)}
                dimmed
              >
                <ProjectRow p={p} selected={sel.projectId === p.id} />
              </Row>
            ))}
        </div>
      )}
    </Column>
  )
}

// ── Coloana 2 · Joburi ───────────────────────────────────────────────────
function JobsColumn({
  project,
  sel,
  onSelect,
  onRefetch,
}: {
  project: ProjectWithKpis
  sel: Selection
  onSelect: (jobId: string | undefined) => void
  onRefetch: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState(project.start_date ?? '')
  const [end, setEnd] = useState(project.end_date ?? '')
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(project.jobs.map((j) => [j.id, j])), [project.jobs])
  const dnd = useDragOrder(
    project.jobs.map((j) => j.id),
    (next) => void setJobsOrder(next).catch((e: Error) => toast(`Ordinea nu s-a salvat: ${e.message}`))
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as JobWithKpis[]

  async function saveNew() {
    if (!name.trim() || !start || !end) return
    setBusy(true)
    try {
      await addJob(
        project.id,
        { name: name.trim(), startDate: start, endDate: end },
        { manopera: 0, utilaje: 0, materiale: 0, subcontractori: 0, organizare: 0 },
        project.jobs.length + 1
      )
      setAdding(false)
      setName('')
      onRefetch()
    } catch (e) {
      toast(`Jobul nu s-a creat: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Column
      title={`Joburi (${project.jobs.length})`}
      width="w-[270px]"
      action={<AddButton label="+ Job" onClick={() => setAdding((a) => !a)} />}
    >
      <div onDragOver={(e) => e.preventDefault()} onDrop={dnd.drop}>
        {ordered.map((j) => {
          const k = j.kpis
          const inLucru = j.tasks.filter((t) => t.status === 'in_lucru').length
          return (
            <Row
              key={j.id}
              selected={sel.jobId === j.id}
              onClick={() => onSelect(sel.jobId === j.id ? undefined : j.id)}
              showLine={dnd.dragId !== null && dnd.overId === j.id && dnd.dragId !== j.id}
              draggableProps={{
                draggable: true,
                onDragStart: () => dnd.setDragId(j.id),
                onDragOver: (e) => {
                  e.preventDefault()
                  if (dnd.dragId && dnd.dragId !== j.id) dnd.setOverId(j.id)
                },
                onDragEnd: dnd.drop,
                className: `relative pb-1 ${dnd.dragId === j.id ? 'opacity-40' : ''}`,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate text-sm ${sel.jobId === j.id ? 'font-semibold' : 'font-medium'}`}
                >
                  {j.name}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">
                  {pct(k.donePct, 0)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#5B6673]">
                {dataRo(j.start_date)} – {dataRo(j.end_date)} · {compact(k.value)} lei
              </p>
              <ProgressBar donePct={k.donePct} planPct={k.planPct} className="mt-1.5 !h-1.5" />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {k.behindDays >= 2 && (
                  <KpiPill color={scheduleColor(k.behindDays)}>
                    {scheduleText(k.behindDays)}
                  </KpiPill>
                )}
                {k.costVariance < 0 && (
                  <KpiPill color="error">{compact(-k.costVariance)} peste buget</KpiPill>
                )}
                {inLucru > 0 && (
                  <span className="text-[11px] text-[#5B6673]">{inLucru} în lucru</span>
                )}
              </div>
            </Row>
          )
        })}
        {dnd.dragId !== null && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              dnd.setOverId('__end__')
            }}
            className="relative h-6"
          >
            {dnd.overId === '__end__' && <InsertLine />}
          </div>
        )}
      </div>

      {project.jobs.length === 0 && !adding && (
        <p className="px-3 py-6 text-center text-xs text-[#5B6673]">
          Niciun job. Apasă „+ Job" ca să definești primul.
        </p>
      )}

      {adding && (
        <div className="space-y-2 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(13,26,45,0.05)]">
          <input
            autoFocus
            className={addInputCls}
            placeholder="Numele jobului"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveNew()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              className={addInputCls}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              aria-label="Început"
            />
            <input
              type="date"
              className={addInputCls}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              aria-label="Sfârșit"
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={busy || !name.trim() || !start || !end}
              onClick={() => void saveNew()}
              className="rounded-full bg-[#58A834] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
            >
              Adaugă jobul
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-full bg-[#EEECE7] px-3 py-1.5 text-xs font-medium"
            >
              Renunță
            </button>
          </div>
        </div>
      )}
    </Column>
  )
}

// ── Coloana 3 · Taskuri ──────────────────────────────────────────────────
function TasksColumn({
  job,
  sel,
  onSelect,
  onRefetch,
}: {
  job: JobWithKpis
  sel: Selection
  onSelect: (taskId: string | undefined) => void
  onRefetch: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(job.tasks.map((t) => [t.id, t])), [job.tasks])
  const dnd = useDragOrder(
    job.tasks.map((t) => t.id),
    (next) => void setTasksOrder(next).catch((e: Error) => toast(`Ordinea nu s-a salvat: ${e.message}`))
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as TaskRow[]

  async function saveNew() {
    if (!name.trim()) return
    setBusy(true)
    try {
      await addTask(job.id, { name: name.trim(), value: toNum(value) }, [], job.tasks.length + 1)
      setAdding(false)
      setName('')
      setValue('')
      onRefetch()
    } catch (e) {
      toast(`Taskul nu s-a creat: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Column
      title={`Taskuri (${job.tasks.length})`}
      width="w-[290px]"
      action={<AddButton label="+ Task" onClick={() => setAdding((a) => !a)} />}
    >
      <div onDragOver={(e) => e.preventDefault()} onDrop={dnd.drop}>
        {ordered.map((t, i) => {
          const p = taskPct(
            t.deliverables.map((d) => ({
              qtyTotal: Number(d.qty_total),
              qtyDone: Number(d.qty_done),
              weight: Number(d.weight),
            }))
          )
          return (
            <Row
              key={t.id}
              selected={sel.taskId === t.id}
              onClick={() => onSelect(sel.taskId === t.id ? undefined : t.id)}
              showLine={dnd.dragId !== null && dnd.overId === t.id && dnd.dragId !== t.id}
              draggableProps={{
                draggable: true,
                onDragStart: () => dnd.setDragId(t.id),
                onDragOver: (e) => {
                  e.preventDefault()
                  if (dnd.dragId && dnd.dragId !== t.id) dnd.setOverId(t.id)
                },
                onDragEnd: dnd.drop,
                className: `relative pb-1 ${dnd.dragId === t.id ? 'opacity-40' : ''}`,
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate text-sm ${sel.taskId === t.id ? 'font-semibold' : 'font-medium'}`}
                >
                  <span className="mr-1 text-xs text-[#5B6673]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {t.name}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">{pct(p, 0)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <StatusPill status={t.status} />
                <span className="text-xs text-[#5B6673]">{compact(Number(t.value))} lei</span>
              </div>
              <ProgressBar donePct={p} className="mt-1.5 !h-1.5" />
            </Row>
          )
        })}
        {dnd.dragId !== null && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              dnd.setOverId('__end__')
            }}
            className="relative h-6"
          >
            {dnd.overId === '__end__' && <InsertLine />}
          </div>
        )}
      </div>

      {job.tasks.length === 0 && !adding && (
        <p className="px-3 py-6 text-center text-xs text-[#5B6673]">
          Niciun task. Apasă „+ Task" ca să definești primul.
        </p>
      )}

      {adding && (
        <div className="space-y-2 rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(13,26,45,0.05)]">
          <input
            autoFocus
            className={addInputCls}
            placeholder="Numele taskului"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveNew()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <input
            className={addInputCls}
            placeholder="Valoarea (lei)"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveNew()
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <div className="flex gap-2">
            <button
              disabled={busy || !name.trim()}
              onClick={() => void saveNew()}
              className="rounded-full bg-[#58A834] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
            >
              Adaugă taskul
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-full bg-[#EEECE7] px-3 py-1.5 text-xs font-medium"
            >
              Renunță
            </button>
          </div>
        </div>
      )}
    </Column>
  )
}

// ── Breadcrumb ───────────────────────────────────────────────────────────
function Breadcrumb({
  project,
  job,
  task,
  onGo,
}: {
  project?: ProjectWithKpis
  job?: JobWithKpis
  task?: TaskRow
  onGo: (sel: Selection) => void
}) {
  const crumb = (label: string, target: Selection, last: boolean) => (
    <span className="flex items-center gap-1.5">
      <button
        onClick={() => onGo(target)}
        className={`max-w-[280px] truncate ${
          last ? 'font-semibold text-[#0D1A2D]' : 'text-[#115468] hover:underline'
        }`}
      >
        {label}
      </button>
      {!last && <span className="text-[#C9C5BC]">›</span>}
    </span>
  )
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm">
      {crumb('Proiecte', {}, !project)}
      {project && crumb(project.name, { projectId: project.id }, !job)}
      {project && job && crumb(job.name, { projectId: project.id, jobId: job.id }, !task)}
      {project &&
        job &&
        task &&
        crumb(task.name, { projectId: project.id, jobId: job.id, taskId: task.id }, true)}
    </nav>
  )
}

// ── Explorer (ecranul principal) ─────────────────────────────────────────
export function ExplorerView({
  projects,
  sel,
  onSelect,
  patchEntity,
  onRefetch,
  onNewProject,
  onOpenCronologic,
}: {
  projects: ProjectWithKpis[]
  sel: Selection
  onSelect: (sel: Selection) => void
  patchEntity: (p: EntityPatch) => void
  onRefetch: () => void
  onNewProject: () => void
  onOpenCronologic: (projectId: string, jobId: string) => void
}) {
  const project = sel.projectId ? projects.find((p) => p.id === sel.projectId) : undefined
  const job = project && sel.jobId ? project.jobs.find((j) => j.id === sel.jobId) : undefined
  const task = job && sel.taskId ? job.tasks.find((t) => t.id === sel.taskId) : undefined
  const save = useMemo(() => makeSave(patchEntity), [patchEntity])

  // Escape urcă un nivel (doar când nu e focusat un input — acelea își gestionează singure Esc)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'))
        return
      if (sel.taskId) onSelect({ projectId: sel.projectId, jobId: sel.jobId })
      else if (sel.jobId) onSelect({ projectId: sel.projectId })
      else if (sel.projectId) onSelect({})
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, onSelect])

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 px-6 py-5">
      <KpiBand projects={projects} selected={project} />

      <Breadcrumb project={project} job={job} task={task} onGo={onSelect} />

      {/* Coloanele: apar pe măsură ce cobori; Detaliu ocupă restul.
          Sub 2xl, când un task e selectat, coloana Proiecte se pliază într-o
          fâșie îngustă — spațiul îi trebuie panoului de livrabile. */}
      <div
        className="flex min-h-0 items-stretch gap-3"
        style={{ height: 'clamp(380px, calc(100vh - 540px), 600px)' }}
      >
        <ProjectsColumn
          projects={projects}
          sel={sel}
          onSelect={(projectId) => onSelect(projectId ? { projectId } : {})}
          onNew={onNewProject}
          className={task ? 'hidden 2xl:flex' : 'flex'}
        />
        {task && (
          <button
            onClick={() => onSelect({ projectId: sel.projectId, jobId: sel.jobId })}
            title="Arată coloana Proiecte (Escape)"
            className="flex w-9 shrink-0 flex-col items-center gap-2 rounded-2xl bg-white/60 py-3 text-[#5B6673] shadow-[0_1px_2px_rgba(13,26,45,0.03)] hover:bg-white 2xl:hidden"
          >
            <span aria-hidden>‹</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">
              Proiecte
            </span>
          </button>
        )}
        {project && (
          <JobsColumn
            project={project}
            sel={sel}
            onSelect={(jobId) =>
              onSelect(jobId ? { projectId: project.id, jobId } : { projectId: project.id })
            }
            onRefetch={onRefetch}
          />
        )}
        {project && job && (
          <TasksColumn
            job={job}
            sel={sel}
            onSelect={(taskId) =>
              onSelect(
                taskId
                  ? { projectId: project.id, jobId: job.id, taskId }
                  : { projectId: project.id, jobId: job.id }
              )
            }
            onRefetch={onRefetch}
          />
        )}
        <DetailPanel
          projects={projects}
          project={project}
          job={job}
          task={task}
          save={save}
          onRefetch={onRefetch}
          onSelect={onSelect}
          onOpenCronologic={onOpenCronologic}
        />
      </div>

      {/* Gantt-ul interactiv — scoput selecției: portofoliu / proiect / job */}
      <GanttChart
        projects={projects}
        sel={sel}
        onSelect={onSelect}
        patchEntity={patchEntity}
        today={todayIso()}
      />
    </div>
  )
}
