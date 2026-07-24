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
import { KpiPill, NeutralPill, ProgressBar, StatusPill, scheduleText } from '../components/ui'
import { toast } from '../components/Toast'
import type { Selection } from '../lib/selection'
import { KpiBand } from './ExplorerKpis'
import { DetailPanel } from './ExplorerDetail'
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
      {/* panoul cald al coloanei — cardurile albe din interior „ies" din el,
          așa fiecare proiect/job/task se citește ca bloc propriu */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl bg-[#F1EEE9] p-2">
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
        className={`cursor-pointer rounded-xl bg-white px-3 py-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#58A834] ${
          selected
            ? 'shadow-[0_1px_2px_rgba(13,26,45,0.06),0_6px_16px_rgba(13,26,45,0.10)] ring-1 ring-[#58A834]'
            : 'shadow-[0_1px_2px_rgba(13,26,45,0.04)] hover:shadow-[0_2px_8px_rgba(13,26,45,0.09)]'
        } ${dimmed ? 'opacity-70' : ''}`}
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

/** Agregatul „Proiecte mici": finalizare 0–100 + câștig/pierdere (cerut în runda 3). */
function SmallAggregate({ projects }: { projects: ProjectWithKpis[] }) {
  const value = projects.reduce((s, p) => s + Number(p.contract_value), 0)
  const ev = projects.reduce((s, p) => s + p.kpis.ev, 0)
  const cost = projects.reduce((s, p) => s + p.kpis.actualCost, 0)
  const completion = value > 0 ? ev / value : 0
  const planWeighted =
    value > 0
      ? projects.reduce((s, p) => s + p.kpis.planPct * Number(p.contract_value), 0) / value
      : 0
  const result = ev - cost
  const margin = ev > 0 ? result / ev : 0
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(13,26,45,0.04)]">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-[#5B6673]">
          {projects.length === 1 ? 'un proiect mic' : `${projects.length} proiecte mici`} ·{' '}
          {compact(value)} lei în total
        </span>
        <span className="font-semibold tabular-nums">{pct(completion, 0)}</span>
      </div>
      <ProgressBar donePct={completion} planPct={planWeighted} className="mt-2" />
      <div className="mt-2 flex flex-wrap gap-2">
        <KpiPill color={result >= 0 ? 'good' : 'error'}>
          {result >= 0 ? `+${compact(result)} lei câștigați` : `${compact(result)} lei pierduți`}
        </KpiPill>
        <NeutralPill>Marjă {pct(margin)}</NeutralPill>
        <NeutralPill>cost {compact(cost)} lei</NeutralPill>
      </div>
    </div>
  )
}

function ProjectsColumn({
  projects,
  sel,
  onSelect,
  onNew,
  patchEntity,
  className,
}: {
  projects: ProjectWithKpis[]
  sel: Selection
  onSelect: (projectId: string | undefined) => void
  onNew: () => void
  patchEntity: (p: EntityPatch) => void
  className?: string
}) {
  // Coloana principală ține DOAR proiectele active mari (munca de zi cu zi).
  // Cele mici și cele finalizate stau într-o secțiune separată, jos în pagină.
  const mainActive = useMemo(() => projects.filter((p) => p.active && !p.is_small), [projects])
  const rest = useMemo(() => projects.filter((p) => !(p.active && !p.is_small)), [projects])

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const dnd = useDragOrder(
    mainActive.map((p) => p.id),
    (next) => {
      // patch optimist: fără el, ordinea din memorie rămâne cea veche și
      // coloana ar reveni la ea la remount (până la un refetch complet)
      next.forEach((id, i) => patchEntity({ kind: 'project', id, patch: { sort_order: i + 1 } }))
      void setProjectsOrder([...next, ...rest.map((p) => p.id)]).catch((e: Error) =>
        toast(`Ordinea nu s-a salvat: ${e.message}`)
      )
    }
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as ProjectWithKpis[]

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
    </Column>
  )
}

/**
 * Secțiunea de jos: „Proiecte mici" (cu agregatul) și „Finalizate". Le folosim
 * rar, deci stau în afara blocului principal de lucru, pliate implicit.
 */
function SecondaryProjects({
  projects,
  sel,
  onSelect,
}: {
  projects: ProjectWithKpis[]
  sel: Selection
  onSelect: (projectId: string) => void
}) {
  const small = useMemo(() => projects.filter((p) => p.active && p.is_small), [projects])
  const done = useMemo(() => projects.filter((p) => !p.active), [projects])
  const [openSmall, setOpenSmall] = useState(false)
  const [openDone, setOpenDone] = useState(false)
  if (small.length === 0 && done.length === 0) return null

  const chip = (p: ProjectWithKpis, dim?: boolean) => (
    <button
      key={p.id}
      onClick={() => onSelect(p.id)}
      className={`flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-left shadow-[0_1px_2px_rgba(13,26,45,0.04)] transition-shadow hover:shadow-[0_2px_8px_rgba(13,26,45,0.09)] ${
        sel.projectId === p.id ? 'ring-1 ring-[#58A834]' : ''
      } ${dim ? 'opacity-70' : ''}`}
    >
      <span className="text-sm font-medium">{p.name}</span>
      <span className="text-xs text-[#5B6673]">{pct(p.kpis.donePct, 0)}</span>
    </button>
  )

  return (
    <div className="space-y-3 border-t border-[#E8E8E8] pt-4">
      {small.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setOpenSmall((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-[#5B6673]"
          >
            <span aria-hidden className={`transition-transform ${openSmall ? 'rotate-90' : ''}`}>
              ›
            </span>
            Proiecte mici ({small.length})
          </button>
          {openSmall && (
            <div className="space-y-3">
              <SmallAggregate projects={small} />
              <div className="flex flex-wrap gap-2">{small.map((p) => chip(p))}</div>
            </div>
          )}
        </div>
      )}
      {done.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setOpenDone((o) => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-[#5B6673]"
          >
            <span aria-hidden className={`transition-transform ${openDone ? 'rotate-90' : ''}`}>
              ›
            </span>
            Finalizate ({done.length})
          </button>
          {openDone && <div className="flex flex-wrap gap-2">{done.map((p) => chip(p, true))}</div>}
        </div>
      )}
    </div>
  )
}

// ── Coloana 2 · Joburi ───────────────────────────────────────────────────
function JobsColumn({
  project,
  sel,
  onSelect,
  onRefetch,
  patchEntity,
}: {
  project: ProjectWithKpis
  sel: Selection
  onSelect: (jobId: string | undefined) => void
  onRefetch: () => void
  patchEntity: (p: EntityPatch) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [start, setStart] = useState(project.start_date ?? '')
  const [end, setEnd] = useState(project.end_date ?? '')
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(project.jobs.map((j) => [j.id, j])), [project.jobs])
  const dnd = useDragOrder(
    project.jobs.map((j) => j.id),
    (next) => {
      next.forEach((id, i) => patchEntity({ kind: 'job', id, patch: { sort_order: i + 1 } }))
      void setJobsOrder(next).catch((e: Error) => toast(`Ordinea nu s-a salvat: ${e.message}`))
    }
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as JobWithKpis[]

  async function saveNew() {
    if (!name.trim() || !start || !end) return
    setBusy(true)
    try {
      const id = await addJob(
        project.id,
        { name: name.trim(), startDate: start, endDate: end },
        { manopera: 0, utilaje: 0, materiale: 0, subcontractori: 0, organizare: 0 },
        project.jobs.length + 1
      )
      setAdding(false)
      setName('')
      onRefetch()
      // jobul nou se deschide direct în Detaliu, ca să-i completezi bugetele
      onSelect(id)
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
  patchEntity,
}: {
  job: JobWithKpis
  sel: Selection
  onSelect: (taskId: string | undefined) => void
  onRefetch: () => void
  patchEntity: (p: EntityPatch) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const byId = useMemo(() => new Map(job.tasks.map((t) => [t.id, t])), [job.tasks])
  const dnd = useDragOrder(
    job.tasks.map((t) => t.id),
    (next) => {
      next.forEach((id, i) => patchEntity({ kind: 'task', id, patch: { sort_order: i + 1 } }))
      void setTasksOrder(next).catch((e: Error) => toast(`Ordinea nu s-a salvat: ${e.message}`))
    }
  )
  const ordered = dnd.order.map((id) => byId.get(id)).filter(Boolean) as TaskRow[]

  async function saveNew() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const id = await addTask(
        job.id,
        { name: name.trim(), value: toNum(value) },
        [],
        job.tasks.length + 1
      )
      setAdding(false)
      setName('')
      setValue('')
      onRefetch()
      // taskul nou se deschide direct în Detaliu, ca să-i adaugi livrabilele
      onSelect(id)
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
        style={{ height: 'clamp(440px, calc(100vh - 300px), 760px)' }}
      >
        <ProjectsColumn
          projects={projects}
          sel={sel}
          onSelect={(projectId) => onSelect(projectId ? { projectId } : {})}
          onNew={onNewProject}
          patchEntity={patchEntity}
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
            patchEntity={patchEntity}
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
            patchEntity={patchEntity}
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

      {/* Proiectele mici + finalizate — le folosim rar, deci stau jos, separat. */}
      <SecondaryProjects
        projects={projects}
        sel={sel}
        onSelect={(projectId) => onSelect({ projectId })}
      />
    </div>
  )
}
