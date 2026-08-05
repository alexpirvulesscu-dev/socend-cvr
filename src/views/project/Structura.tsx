// Structura unui proiect: joburile, iar sub fiecare job taskurile lui.
// În stânga arborele (se desfășoară pe loc, nu în coloane care te urmăresc),
// în dreapta cardul de detaliu al lucrului selectat — acolo stau și livrabilele.
import { useEffect, useMemo, useState } from 'react'
import type { EntityPatch, JobWithKpis, ProjectWithKpis, TaskRow } from '../../data/projects'
import { addJob, addTask, setJobsOrder, setTasksOrder } from '../../data/mutations'
import type { Save } from '../../data/save'
import { marginColor, scheduleColor, taskPct } from '../../domain/kpi'
import { compact, dataScurt, num, pct, toNum, zile } from '../../lib/format'
import {
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  StatusPill,
  toneOf,
} from '../../components/ui'
import { toast } from '../../components/Toast'
import { TARIF_ORA, manDaysToHours } from '../../data/labour'
import type { Selection } from '../../lib/selection'
import { JobDetail, ProjectDetail, TaskDetail } from './Detalii'

// ── Reordonare prin tragere (linia verde de inserție) ────────────────────
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

function InsertLine() {
  return (
    <div className="pointer-events-none absolute -top-px left-0 right-0 z-10 flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-accent" />
      <span className="h-[3px] flex-1 rounded-full bg-accent" />
    </div>
  )
}

const inputCls =
  'w-full rounded-btn border border-line-2 bg-paper-0 px-2.5 py-2 text-row text-ink-1 transition-colors duration-[120ms] ease-std placeholder:text-ink-4 hover:border-line-3 focus:border-accent'

/** Butonul discret din antetul unei secțiuni („+ Job", „+ Task"). */
function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-chip px-2 py-1 text-row font-semibold text-accent-ink transition-colors duration-[120ms] ease-std hover:bg-accent-soft"
    >
      {label}
    </button>
  )
}

// ── Rândurile arborelui ──────────────────────────────────────────────────

function Row({
  selected,
  onClick,
  draggableProps,
  showLine,
  children,
  className = '',
}: {
  selected: boolean
  onClick: () => void
  draggableProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
  showLine?: boolean
  children: React.ReactNode
  className?: string
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
        className={`relative cursor-pointer border-b border-line-1 px-5 py-3 transition-colors duration-[120ms] ease-std ${
          selected ? 'bg-accent-soft' : 'hover:bg-paper-1'
        } ${className}`}
      >
        {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />}
        {children}
      </div>
    </div>
  )
}

function JobRow({
  job,
  open,
  onToggle,
  onSelect,
}: {
  job: JobWithKpis
  open: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const k = job.kpis
  const late = k.behindDays >= 2
  const inLucru = job.tasks.filter((t) => t.status === 'in_lucru').length
  // în arbore, joburile și taskurile se măsoară în ORE (manopera vândută / tarif),
  // nu în lei de contract — banii de contract se văd doar la nivel de proiect
  const oreJob = Math.round((job.budgetByCategory.manopera ?? 0) / TARIF_ORA)
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        aria-label={open ? 'Restrânge jobul' : 'Desfășoară jobul'}
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-chip text-ink-3 transition-transform duration-[120ms] ease-std hover:bg-segment ${
          open ? 'rotate-90' : ''
        }`}
      >
        ›
      </button>
      <div className="min-w-0 flex-1" onClick={onSelect}>
        <p className="truncate text-row font-semibold text-ink-1">{job.name}</p>
        <p className="truncate text-sub text-ink-3">
          {dataScurt(job.start_date)} – {dataScurt(job.end_date)} · {num(oreJob)} ore
          {late && (
            <span className={scheduleColor(k.behindDays) === 'error' ? 'text-neg' : 'text-warn'}>
              {' '}
              · {zile(k.behindDays)} în urmă
            </span>
          )}
          {inLucru > 0 && <span className="text-ink-3"> · {inLucru} în lucru</span>}
        </p>
      </div>
      <div className="hidden w-[120px] shrink-0 items-center gap-2 sm:flex" onClick={onSelect}>
        <ProgressBar donePct={k.donePct} planPct={k.planPct} className="flex-1" />
        <span className="w-9 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
          {pct(k.donePct)}
        </span>
      </div>
    </div>
  )
}

function TaskRow({
  task,
  index,
  onSelect,
}: {
  task: TaskRow
  index: number
  onSelect: () => void
}) {
  const done = taskPct(
    task.deliverables.map((d) => ({
      qtyTotal: Number(d.qty_total),
      qtyDone: Number(d.qty_done),
      weight: Number(d.weight),
    }))
  )
  const oreTask = Math.round(
    manDaysToHours(
      task.planned_man_days ??
        task.deliverables.reduce((sum, d) => sum + Number(d.planned_man_days ?? 0), 0)
    )
  )
  return (
    <div className="flex items-center gap-3 pl-9" onClick={onSelect}>
      <span className="w-5 shrink-0 text-meta font-semibold tabular-nums text-ink-4">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-row font-medium text-ink-1">{task.name}</p>
        <p className="truncate text-sub text-ink-3">
          {num(oreTask)} ore
          {task.deliverables.length > 0 && (
            <span className="text-ink-3">
              {' '}
              · {task.deliverables.length}{' '}
              {task.deliverables.length === 1 ? 'livrabil' : 'livrabile'}
            </span>
          )}
        </p>
      </div>
      {/* „Neînceput" e cazul obișnuit și se citește oricum din 0,0% — pastila
          apare doar când taskul are ceva de spus, ca numele să nu se taie */}
      {task.status !== 'neinceput' && <StatusPill status={task.status} />}
      <div className="hidden w-[120px] shrink-0 items-center gap-2 sm:flex">
        <ProgressBar donePct={done} className="flex-1" />
        <span className="w-9 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
          {pct(done)}
        </span>
      </div>
    </div>
  )
}

// ── Formularele de adăugare ──────────────────────────────────────────────

function AddJobForm({
  p,
  onDone,
}: {
  p: ProjectWithKpis
  onDone: (id?: string) => void
}) {
  const [name, setName] = useState('')
  const [start, setStart] = useState(p.start_date ?? '')
  const [end, setEnd] = useState(p.end_date ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim() || !start || !end) return
    setBusy(true)
    try {
      const id = await addJob(
        p.id,
        { name: name.trim(), startDate: start, endDate: end },
        { manopera: 0, utilaje: 0, materiale: 0, subcontractori: 0, organizare: 0 },
        p.jobs.length + 1
      )
      onDone(id)
    } catch (e) {
      toast(`Jobul nu s-a creat: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-b border-line-1 bg-paper-1 px-5 py-4">
      <input
        autoFocus
        className={inputCls}
        placeholder="Numele jobului"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          className={inputCls}
          value={start}
          onChange={(e) => setStart(e.target.value)}
          aria-label="Început"
        />
        <input
          type="date"
          className={inputCls}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          aria-label="Sfârșit"
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={busy || !name.trim() || !start || !end}
          onClick={() => void save()}
          className="rounded-btn bg-accent px-3 py-2 text-row font-semibold text-paper-0 hover:bg-accent-hover disabled:bg-line-2 disabled:text-ink-4"
        >
          Adaugă jobul
        </button>
        <button
          onClick={() => onDone()}
          className="rounded-btn border border-line-3 bg-paper-0 px-3 py-2 text-row font-semibold text-ink-2 hover:bg-paper-1"
        >
          Renunță
        </button>
      </div>
    </div>
  )
}

function AddTaskForm({ job, onDone }: { job: JobWithKpis; onDone: (id?: string) => void }) {
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await addTask(
        job.id,
        { name: name.trim(), value: toNum(value) },
        [],
        job.tasks.length + 1
      )
      onDone(id)
    } catch (e) {
      toast(`Taskul nu s-a creat: ${(e as Error).message}`)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 border-b border-line-1 bg-paper-1 py-4 pl-14 pr-5">
      <input
        autoFocus
        className={inputCls}
        placeholder="Numele taskului"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
      />
      <input
        className={inputCls}
        placeholder="Valoarea (lei)"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') onDone()
        }}
      />
      <div className="flex gap-2">
        <button
          disabled={busy || !name.trim()}
          onClick={() => void save()}
          className="rounded-btn bg-accent px-3 py-2 text-row font-semibold text-paper-0 hover:bg-accent-hover disabled:bg-line-2 disabled:text-ink-4"
        >
          Adaugă taskul
        </button>
        <button
          onClick={() => onDone()}
          className="rounded-btn border border-line-3 bg-paper-0 px-3 py-2 text-row font-semibold text-ink-2 hover:bg-paper-1"
        >
          Renunță
        </button>
      </div>
    </div>
  )
}

// ── Arborele ─────────────────────────────────────────────────────────────

function Arbore({
  p,
  sel,
  onSelect,
  onRefetch,
  patchEntity,
}: {
  p: ProjectWithKpis
  sel: Selection
  onSelect: (sel: Selection) => void
  onRefetch: () => void
  patchEntity: (patch: EntityPatch) => void
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(sel.jobId ? [sel.jobId] : []))
  const [addingJob, setAddingJob] = useState(false)
  const [addingTaskIn, setAddingTaskIn] = useState<string | null>(null)

  // jobul selectat din altă parte (Gantt, „Ce urmează") se deschide singur
  useEffect(() => {
    if (sel.jobId) setOpen((s) => (s.has(sel.jobId!) ? s : new Set(s).add(sel.jobId!)))
  }, [sel.jobId])

  const byId = useMemo(() => new Map(p.jobs.map((j) => [j.id, j])), [p.jobs])
  const dnd = useDragOrder(
    p.jobs.map((j) => j.id),
    (next) => {
      next.forEach((id, i) => patchEntity({ kind: 'job', id, patch: { sort_order: i + 1 } }))
      void setJobsOrder(next).catch((e: Error) => toast(`Ordinea nu s-a salvat: ${e.message}`))
    }
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as JobWithKpis[]

  function toggle(id: string) {
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card className="overflow-hidden !p-0">
      <div className="flex items-center justify-between gap-2 border-b border-line-1 px-5 py-2.5">
        <h2 className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
          Joburi ({p.jobs.length})
        </h2>
        <AddButton label="+ Job" onClick={() => setAddingJob((a) => !a)} />
      </div>

      {addingJob && (
        <AddJobForm
          p={p}
          onDone={(id) => {
            setAddingJob(false)
            if (id) {
              onRefetch()
              onSelect({ projectId: p.id, jobId: id })
            }
          }}
        />
      )}

      <div onDragOver={(e) => e.preventDefault()} onDrop={dnd.drop}>
        {ordered.map((j) => (
          <div key={j.id}>
            <Row
              selected={sel.jobId === j.id && !sel.taskId}
              onClick={() => {
                onSelect({ projectId: p.id, jobId: j.id })
                setOpen((s) => new Set(s).add(j.id))
              }}
              showLine={dnd.dragId !== null && dnd.overId === j.id && dnd.dragId !== j.id}
              draggableProps={{
                draggable: true,
                onDragStart: () => dnd.setDragId(j.id),
                onDragOver: (e) => {
                  e.preventDefault()
                  if (dnd.dragId && dnd.dragId !== j.id) dnd.setOverId(j.id)
                },
                onDragEnd: dnd.drop,
                className: `relative ${dnd.dragId === j.id ? 'opacity-40' : ''}`,
              }}
            >
              <JobRow
                job={j}
                open={open.has(j.id)}
                onToggle={() => toggle(j.id)}
                onSelect={() => onSelect({ projectId: p.id, jobId: j.id })}
              />
            </Row>

            {open.has(j.id) && (
              <TaskuriJob
                p={p}
                job={j}
                sel={sel}
                onSelect={onSelect}
                patchEntity={patchEntity}
                adding={addingTaskIn === j.id}
                onAdd={() => setAddingTaskIn(addingTaskIn === j.id ? null : j.id)}
                onAdded={(id) => {
                  setAddingTaskIn(null)
                  if (id) {
                    onRefetch()
                    onSelect({ projectId: p.id, jobId: j.id, taskId: id })
                  }
                }}
              />
            )}
          </div>
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

      {p.jobs.length === 0 && !addingJob && (
        <EmptyState title="Proiectul nu are încă joburi">
          Un job e o bucată mare de lucrare (un punct termic, un tronson). Apasă „+ Job".
        </EmptyState>
      )}
    </Card>
  )
}

function TaskuriJob({
  p,
  job,
  sel,
  onSelect,
  patchEntity,
  adding,
  onAdd,
  onAdded,
}: {
  p: ProjectWithKpis
  job: JobWithKpis
  sel: Selection
  onSelect: (sel: Selection) => void
  patchEntity: (patch: EntityPatch) => void
  adding: boolean
  onAdd: () => void
  onAdded: (id?: string) => void
}) {
  const byId = useMemo(() => new Map(job.tasks.map((t) => [t.id, t])), [job.tasks])
  const dnd = useDragOrder(
    job.tasks.map((t) => t.id),
    (next) => {
      next.forEach((id, i) => patchEntity({ kind: 'task', id, patch: { sort_order: i + 1 } }))
      void setTasksOrder(next).catch((e: Error) => toast(`Ordinea nu s-a salvat: ${e.message}`))
    }
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as TaskRow[]

  return (
    <div className="bg-paper-1/60" onDragOver={(e) => e.preventDefault()} onDrop={dnd.drop}>
      {ordered.map((t, i) => (
        <Row
          key={t.id}
          selected={sel.taskId === t.id}
          onClick={() => onSelect({ projectId: p.id, jobId: job.id, taskId: t.id })}
          showLine={dnd.dragId !== null && dnd.overId === t.id && dnd.dragId !== t.id}
          draggableProps={{
            draggable: true,
            onDragStart: () => dnd.setDragId(t.id),
            onDragOver: (e) => {
              e.preventDefault()
              if (dnd.dragId && dnd.dragId !== t.id) dnd.setOverId(t.id)
            },
            onDragEnd: dnd.drop,
            className: `relative ${dnd.dragId === t.id ? 'opacity-40' : ''}`,
          }}
        >
          <TaskRow task={t} index={i} onSelect={() => {}} />
        </Row>
      ))}

      {adding ? (
        <AddTaskForm job={job} onDone={onAdded} />
      ) : (
        <div className="border-b border-line-1 py-2 pl-14 pr-5">
          <AddButton label="+ Task" onClick={onAdd} />
        </div>
      )}
    </div>
  )
}

// ── Panoul „Prezentare" ──────────────────────────────────────────────────

export function StructuraProiect({
  p,
  sel,
  onSelect,
  save,
  onRefetch,
  patchEntity,
  onOpenCronologic,
}: {
  p: ProjectWithKpis
  sel: Selection
  onSelect: (sel: Selection) => void
  save: Save
  onRefetch: () => void
  patchEntity: (patch: EntityPatch) => void
  onOpenCronologic: (projectId: string, jobId: string) => void
}) {
  const job = sel.jobId ? p.jobs.find((j) => j.id === sel.jobId) : undefined
  const task = job && sel.taskId ? job.tasks.find((t) => t.id === sel.taskId) : undefined
  const marginTone = p.kpis.ev > 0 ? toneOf(marginColor(p.kpis.margin)) : 'neutral'

  // arborele are lățime fixă, detaliul ia restul: tabelul de livrabile din
  // cardul de task are nevoie de spațiu, altfel numele livrabilelor se taie
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-4">
        <Arbore p={p} sel={sel} onSelect={onSelect} onRefetch={onRefetch} patchEntity={patchEntity} />
        {p.jobs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-1">
            <Pill tone={marginTone}>Marjă {pct(p.kpis.margin)}</Pill>
            <Pill tone="neutral">{compact(p.kpis.ev)} lei executați</Pill>
            <Pill tone="neutral">{compact(p.kpis.actualCost)} lei cost</Pill>
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-4">
        {task && job ? (
          <TaskDetail
            p={p}
            job={job}
            task={task}
            save={save}
            onRefetch={onRefetch}
            onSelect={onSelect}
          />
        ) : job ? (
          <JobDetail
            p={p}
            job={job}
            save={save}
            onRefetch={onRefetch}
            onSelect={onSelect}
            onOpenCronologic={onOpenCronologic}
          />
        ) : (
          <ProjectDetail p={p} save={save} onRefetch={onRefetch} onSelect={onSelect} />
        )}
      </div>
    </div>
  )
}
