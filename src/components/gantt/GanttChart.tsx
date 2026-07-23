// Gantt-ul interactiv v3 — construit de la zero, fără librării.
//  - rânduri ierarhice: proiect → joburi → taskuri, după selecția din Explorer
//  - barele de JOB și TASK se trag (mutare) și se redimensionează de capete,
//    cu „snap" pe zi; bara de PROIECT e calculată din joburi (nu se trage)
//  - mutarea unui job își mută și taskurile; totul optimist + revert la eroare
//  - drag cu Pointer Events + setPointerCapture (nu HTML5 DnD): fără imaginea-
//    fantomă, funcționează și pe touch; în timpul tragerii nu se scrie nimic —
//    doar la eliberare
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  EntityPatch,
  JobWithKpis,
  ProjectWithKpis,
  TaskRow,
} from '../../data/projects'
import { shiftJobWithTasks, updateJobDates, updateTaskDates } from '../../data/mutations'
import { taskPct } from '../../domain/kpi'
import { dataRo, pct } from '../../lib/format'
import { toast } from '../Toast'
import type { Selection } from '../../lib/selection'
import {
  ZOOM_LEVELS,
  addDays,
  chartRange,
  dayIndex,
  monthSegments,
  pxToDeltaDays,
  weekdayIndex,
  type ZoomLevel,
} from './ganttScale'

const LABEL_W = 240
const ROW_H = 36

// ── Modelul de rând ──────────────────────────────────────────────────────
interface GRow {
  key: string
  kind: 'project' | 'job' | 'task'
  id: string
  label: string
  depth: 0 | 1 | 2
  start: string | null
  end: string | null
  donePct: number
  editable: boolean
  /** task fără date proprii — moștenește vizual fereastra jobului (bară punctată) */
  ghost?: boolean
  /** task în afara ferestrei jobului — avertisment, nu blocaj */
  outside?: boolean
  caret?: boolean
  collapsed?: boolean
  projectId: string
  jobId?: string
  /** pentru comiterea mutării unui job (cu taskurile lui) */
  job?: JobWithKpis
  task?: TaskRow
}

function taskDone(t: TaskRow): number {
  return taskPct(
    t.deliverables.map((d) => ({
      qtyTotal: Number(d.qty_total),
      qtyDone: Number(d.qty_done),
      weight: Number(d.weight),
    }))
  )
}

/** Fereastra derivată a unui proiect: min/max peste joburi, altfel datele proprii. */
function projectWindow(p: ProjectWithKpis): { start: string | null; end: string | null } {
  if (p.jobs.length === 0) return { start: p.start_date, end: p.end_date }
  let start = p.jobs[0].start_date
  let end = p.jobs[0].end_date
  for (const j of p.jobs) {
    if (j.start_date < start) start = j.start_date
    if (j.end_date > end) end = j.end_date
  }
  return { start, end }
}

function taskRowOf(p: ProjectWithKpis, j: JobWithKpis, t: TaskRow, depth: 0 | 1 | 2): GRow {
  const start = t.start_date ?? j.start_date
  const end = t.end_date ?? j.end_date
  const outside =
    (t.start_date !== null && t.start_date < j.start_date) ||
    (t.end_date !== null && t.end_date > j.end_date)
  return {
    key: `t:${t.id}`,
    kind: 'task',
    id: t.id,
    label: t.name,
    depth,
    start,
    end,
    donePct: taskDone(t),
    editable: true,
    ghost: t.start_date === null && t.end_date === null,
    outside,
    projectId: p.id,
    jobId: j.id,
    task: t,
  }
}

/** Construiește rândurile vizibile după selecție + starea de pliere. */
function buildRows(
  projects: ProjectWithKpis[],
  sel: Selection,
  collapsed: Set<string>
): GRow[] {
  const rows: GRow[] = []
  const jobRow = (p: ProjectWithKpis, j: JobWithKpis, depth: 0 | 1 | 2): GRow => ({
    key: `j:${j.id}`,
    kind: 'job',
    id: j.id,
    label: j.name,
    depth,
    start: j.start_date,
    end: j.end_date,
    donePct: j.kpis.donePct,
    editable: true,
    caret: j.tasks.length > 0,
    collapsed: collapsed.has(`j:${j.id}`),
    projectId: p.id,
    job: j,
  })

  if (sel.projectId && sel.jobId) {
    // fereastra unui job: jobul + toate taskurile lui
    const p = projects.find((x) => x.id === sel.projectId)
    const j = p?.jobs.find((x) => x.id === sel.jobId)
    if (!p || !j) return rows
    rows.push({ ...jobRow(p, j, 0), caret: false })
    for (const t of j.tasks) rows.push(taskRowOf(p, j, t, 1))
    return rows
  }

  if (sel.projectId) {
    // un proiect: joburile lui, pliabile la nivel de task
    const p = projects.find((x) => x.id === sel.projectId)
    if (!p) return rows
    for (const j of p.jobs) {
      const r = jobRow(p, j, 0)
      rows.push(r)
      if (!r.collapsed) for (const t of j.tasks) rows.push(taskRowOf(p, j, t, 1))
    }
    return rows
  }

  // portofoliu: toate proiectele active, pliabile pe joburi și taskuri
  for (const p of projects.filter((x) => x.active)) {
    const w = projectWindow(p)
    const pCollapsed = collapsed.has(`p:${p.id}`)
    rows.push({
      key: `p:${p.id}`,
      kind: 'project',
      id: p.id,
      label: p.name,
      depth: 0,
      start: w.start,
      end: w.end,
      donePct: p.kpis.donePct,
      editable: false, // fereastra proiectului e calculată din joburi
      caret: p.jobs.length > 0,
      collapsed: pCollapsed,
      projectId: p.id,
    })
    if (!pCollapsed) {
      for (const j of p.jobs) {
        const r = jobRow(p, j, 1)
        rows.push(r)
        if (!r.collapsed) for (const t of j.tasks) rows.push(taskRowOf(p, j, t, 2))
      }
    }
  }
  return rows
}

// ── Starea de tragere ────────────────────────────────────────────────────
type DragMode = 'move' | 'resize-l' | 'resize-r'
interface DragState {
  row: GRow
  mode: DragMode
  originX: number
  startIdx: number
  endIdx: number
  deltaDays: number
  moved: boolean
}

export function GanttChart({
  projects,
  sel,
  onSelect,
  patchEntity,
  today,
}: {
  projects: ProjectWithKpis[]
  sel: Selection
  onSelect: (sel: Selection) => void
  patchEntity: (p: EntityPatch) => void
  today: string
}) {
  const [zoom, setZoom] = useState<ZoomLevel>('luna')
  const [lookahead, setLookahead] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<DragState | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dayWidth = ZOOM_LEVELS[zoom]

  // starea implicită de pliere depinde de scop: în portofoliu, joburile stau
  // pliate (vezi proiectele + joburile, nu zeci de taskuri); într-un proiect,
  // joburile stau desfăcute. Se re-inițializează când se schimbă selecția.
  const scopeKey = `${sel.projectId ?? ''}|${sel.jobId ?? ''}`
  useEffect(() => {
    if (!sel.projectId) {
      const jobKeys = projects
        .filter((p) => p.active)
        .flatMap((p) => p.jobs.map((j) => `j:${j.id}`))
      setCollapsed(new Set(jobKeys))
    } else {
      setCollapsed(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  const allRows = useMemo(() => buildRows(projects, sel, collapsed), [projects, sel, collapsed])

  // filtrul „următoarele 2 săptămâni": doar rândurile care ating fereastra
  const laEnd = addDays(today, 13)
  const rows = useMemo(
    () =>
      lookahead
        ? allRows.filter((r) => r.start !== null && r.end !== null && r.start <= laEnd && r.end >= today)
        : allRows,
    [allRows, lookahead, today, laEnd]
  )

  const range = useMemo(() => {
    const dates: string[] = []
    for (const r of rows) {
      if (r.start) dates.push(r.start)
      if (r.end) dates.push(r.end)
    }
    return chartRange(dates.length ? dates : [today], today)
  }, [rows, today])

  const months = useMemo(() => monthSegments(range.start, range.days), [range])
  const trackW = range.days * dayWidth

  // sâmbetele (pentru umbrirea weekendurilor la zoom-urile detaliate)
  const saturdays = useMemo(() => {
    if (dayWidth < 10) return []
    const out: number[] = []
    for (let i = 0; i < range.days; i++) {
      if (weekdayIndex(addDays(range.start, i)) === 5) out.push(i)
    }
    return out
  }, [range, dayWidth])

  // săptămânile (etichete la zoom „luna")
  const weekStarts = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < range.days; i++) {
      if (weekdayIndex(addDays(range.start, i)) === 0) out.push(i)
    }
    return out
  }, [range])

  // derulează la „azi" când se schimbă zoom-ul / fereastra
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const x = dayIndex(range.start, today) * dayWidth
    el.scrollLeft = Math.max(0, x - (el.clientWidth - LABEL_W) / 3)
  }, [range.start, dayWidth, today])

  // Escape anulează tragerea în curs
  useEffect(() => {
    if (!drag) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrag(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drag])

  function toggleCaret(key: string) {
    setCollapsed((old) => {
      const next = new Set(old)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectRow(r: GRow) {
    if (r.kind === 'project') onSelect({ projectId: r.projectId })
    else if (r.kind === 'job') onSelect({ projectId: r.projectId, jobId: r.id })
    else onSelect({ projectId: r.projectId, jobId: r.jobId, taskId: r.id })
  }

  /** Comite mutarea/redimensionarea la eliberarea barei — optimist + revert. */
  function commitDrag(d: DragState) {
    const newStart = addDays(range.start, d.startIdx + (d.mode !== 'resize-r' ? d.deltaDays : 0))
    const newEnd = addDays(range.start, d.endIdx + (d.mode !== 'resize-l' ? d.deltaDays : 0))
    const r = d.row

    if (r.kind === 'task' && r.task) {
      const t = r.task
      patchEntity({ kind: 'task', id: t.id, patch: { start_date: newStart, end_date: newEnd } })
      updateTaskDates(t.id, newStart, newEnd).catch((e: Error) => {
        patchEntity({ kind: 'task', id: t.id, patch: { start_date: t.start_date, end_date: t.end_date } })
        toast(`Nu s-a salvat: ${e.message}`)
      })
      return
    }

    if (r.kind === 'job' && r.job) {
      const j = r.job
      if (d.mode === 'move') {
        // jobul se mută cu tot cu taskurile lui (doar cele cu date proprii au
        // ce muta — cele-fantomă moștenesc oricum fereastra jobului)
        const delta = d.deltaDays
        const shifted = j.tasks
          .filter((t) => t.start_date !== null || t.end_date !== null)
          .map((t) => ({
            id: t.id,
            startDate: t.start_date ? addDays(t.start_date, delta) : addDays(j.start_date, delta),
            endDate: t.end_date ? addDays(t.end_date, delta) : addDays(j.end_date, delta),
          }))
        patchEntity({ kind: 'job', id: j.id, patch: { start_date: newStart, end_date: newEnd } })
        for (const s of shifted)
          patchEntity({ kind: 'task', id: s.id, patch: { start_date: s.startDate, end_date: s.endDate } })
        shiftJobWithTasks(j.id, { startDate: newStart, endDate: newEnd }, shifted).catch(
          (e: Error) => {
            patchEntity({ kind: 'job', id: j.id, patch: { start_date: j.start_date, end_date: j.end_date } })
            for (const t of j.tasks)
              patchEntity({ kind: 'task', id: t.id, patch: { start_date: t.start_date, end_date: t.end_date } })
            toast(`Nu s-a salvat: ${e.message}`)
          }
        )
      } else {
        patchEntity({ kind: 'job', id: j.id, patch: { start_date: newStart, end_date: newEnd } })
        updateJobDates(j.id, newStart, newEnd).catch((e: Error) => {
          patchEntity({ kind: 'job', id: j.id, patch: { start_date: j.start_date, end_date: j.end_date } })
          toast(`Nu s-a salvat: ${e.message}`)
        })
      }
    }
  }

  function onBarPointerDown(e: React.PointerEvent, r: GRow, mode: DragMode) {
    if (!r.editable || !r.start || !r.end) return
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    setDrag({
      row: r,
      mode,
      originX: e.clientX,
      startIdx: dayIndex(range.start, r.start),
      endIdx: dayIndex(range.start, r.end),
      deltaDays: 0,
      moved: false,
    })
  }

  function onBarPointerMove(e: React.PointerEvent) {
    if (!drag) return
    const raw = pxToDeltaDays(e.clientX - drag.originX, dayWidth)
    let d = raw
    // limitele: minim o zi; capetele nu se încrucișează
    if (drag.mode === 'resize-l') d = Math.min(raw, drag.endIdx - drag.startIdx)
    if (drag.mode === 'resize-r') d = Math.max(raw, drag.startIdx - drag.endIdx)
    const moved = drag.moved || Math.abs(e.clientX - drag.originX) > 4
    if (d !== drag.deltaDays || moved !== drag.moved)
      setDrag({ ...drag, deltaDays: d, moved })
  }

  function onBarPointerUp(r: GRow) {
    if (!drag) return
    if (!drag.moved) {
      selectRow(r) // a fost un click, nu o tragere
    } else if (drag.deltaDays !== 0) {
      commitDrag(drag)
    }
    setDrag(null)
  }

  const todayX = dayIndex(range.start, today) * dayWidth

  const zoomChip = (z: ZoomLevel, label: string) => (
    <button
      key={z}
      onClick={() => setZoom(z)}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        zoom === z ? 'bg-[#DDEDDC] text-[#0D1A2D]' : 'text-[#5B6673] hover:text-[#0D1A2D]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="rounded-[20px] bg-white shadow-[0_1px_2px_rgba(13,26,45,0.04),0_8px_24px_rgba(13,26,45,0.06)]">
      {/* bara de comandă a Gantt-ului */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <h3 className="text-base font-semibold">
          Cronologie
          <span className="ml-2 text-sm font-normal text-[#5B6673]">
            {sel.jobId
              ? 'jobul selectat'
              : sel.projectId
                ? 'proiectul selectat'
                : 'toate proiectele active'}
          </span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLookahead((l) => !l)}
            className={`mr-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              lookahead ? 'bg-[#115468] text-white' : 'bg-[#EEECE7] text-[#5B6673] hover:text-[#0D1A2D]'
            }`}
          >
            Următoarele 2 săptămâni
          </button>
          {zoomChip('saptamana', 'Săptămână')}
          {zoomChip('luna', 'Lună')}
          {zoomChip('trimestru', 'Trimestru')}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-[#5B6673]">
          {lookahead
            ? 'Nimic planificat în următoarele 2 săptămâni.'
            : 'Niciun rând de arătat — alege un proiect sau adaugă joburi.'}
        </p>
      ) : (
        <div ref={scrollRef} className="mt-3 overflow-x-auto pb-2">
          <div style={{ width: LABEL_W + trackW, minWidth: '100%' }}>
            {/* axa de timp: banda lunilor + săptămâni/zile */}
            <div className="sticky top-0 z-20">
              <div className="flex">
                <div
                  className="sticky left-0 z-10 shrink-0 bg-white"
                  style={{ width: LABEL_W }}
                />
                <div className="relative h-6" style={{ width: trackW }}>
                  {months.map((m) => (
                    <span
                      key={m.label + m.startIdx}
                      className="absolute top-0 truncate border-l border-[#E8E8E8] pl-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]"
                      style={{ left: m.startIdx * dayWidth, width: m.days * dayWidth }}
                    >
                      {m.days * dayWidth > 44 ? m.label : ''}
                    </span>
                  ))}
                </div>
              </div>
              {zoom !== 'trimestru' && (
                <div className="flex">
                  <div className="sticky left-0 z-10 shrink-0 bg-white" style={{ width: LABEL_W }} />
                  <div className="relative h-5" style={{ width: trackW }}>
                    {zoom === 'saptamana'
                      ? Array.from({ length: range.days }, (_, i) => (
                          <span
                            key={i}
                            className={`absolute top-0 text-center text-[10px] tabular-nums ${
                              weekdayIndex(addDays(range.start, i)) >= 5
                                ? 'text-[#C9C5BC]'
                                : 'text-[#5B6673]'
                            }`}
                            style={{ left: i * dayWidth, width: dayWidth }}
                          >
                            {addDays(range.start, i).slice(8)}
                          </span>
                        ))
                      : weekStarts.map((i) => (
                          <span
                            key={i}
                            className="absolute top-0 border-l border-[#E8E8E8] pl-1 text-[10px] tabular-nums text-[#5B6673]"
                            style={{ left: i * dayWidth, width: 7 * dayWidth }}
                          >
                            {Number(addDays(range.start, i).slice(8))}
                          </span>
                        ))}
                  </div>
                </div>
              )}
            </div>

            {/* corpul: rândurile cu bare. FĂRĂ overflow-y aici — un al doilea
                container de scroll ar rupe sticky-ul etichetelor față de
                scroller-ul orizontal (pagina derulează vertical, nu cardul). */}
            <div className="relative">
              {/* umbrirea weekendurilor + linia de azi, pe toată înălțimea */}
              <div
                className="pointer-events-none absolute inset-y-0 z-0"
                style={{ left: LABEL_W, width: trackW }}
              >
                {saturdays.map((i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 bg-[#F3F1EC]"
                    style={{ left: i * dayWidth, width: 2 * dayWidth }}
                  />
                ))}
                {lookahead && (
                  <div
                    className="absolute inset-y-0 bg-[#DDEDDC]/40"
                    style={{
                      left: dayIndex(range.start, today) * dayWidth,
                      width: 14 * dayWidth,
                    }}
                  />
                )}
                <div
                  className="absolute inset-y-0 w-0.5 bg-[#115468]"
                  style={{ left: todayX + dayWidth / 2 }}
                  title={`Azi · ${dataRo(today)}`}
                />
              </div>

              {rows.map((r) => {
                const isDragging = drag?.row.key === r.key
                let geom: { left: number; width: number } | null = null
                if (r.start && r.end) {
                  let sIdx = dayIndex(range.start, r.start)
                  let eIdx = dayIndex(range.start, r.end)
                  if (isDragging && drag) {
                    if (drag.mode !== 'resize-r') sIdx = drag.startIdx + drag.deltaDays
                    if (drag.mode !== 'resize-l') eIdx = drag.endIdx + drag.deltaDays
                    if (drag.mode === 'resize-l') eIdx = drag.endIdx
                    if (drag.mode === 'resize-r') sIdx = drag.startIdx
                  }
                  geom = {
                    left: sIdx * dayWidth,
                    width: (eIdx - sIdx + 1) * dayWidth,
                  }
                }
                const selectedRow =
                  (r.kind === 'project' && sel.projectId === r.id && !sel.jobId) ||
                  (r.kind === 'job' && sel.jobId === r.id && !sel.taskId) ||
                  (r.kind === 'task' && sel.taskId === r.id)

                return (
                  <div
                    key={r.key}
                    className={`relative z-10 flex items-center ${selectedRow ? 'bg-[#DDEDDC]/30' : ''}`}
                    style={{ height: ROW_H }}
                  >
                    {/* eticheta din stânga (lipită la scroll orizontal) */}
                    <div
                      className="sticky left-0 z-20 flex h-full shrink-0 items-center gap-1 border-r border-[#F3F1EC] bg-white pr-2"
                      style={{ width: LABEL_W, paddingLeft: 8 + r.depth * 16 }}
                    >
                      {r.caret ? (
                        <button
                          onClick={() => toggleCaret(r.key)}
                          aria-label={r.collapsed ? 'Desfă' : 'Pliază'}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#5B6673] hover:bg-[#EEECE7]"
                        >
                          <span
                            aria-hidden
                            className={`text-xs transition-transform ${r.collapsed ? '' : 'rotate-90'}`}
                          >
                            ›
                          </span>
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      <button
                        onClick={() => selectRow(r)}
                        className={`min-w-0 flex-1 truncate text-left text-sm hover:text-[#115468] ${
                          r.kind === 'project'
                            ? 'font-semibold'
                            : r.kind === 'job'
                              ? 'font-medium'
                              : 'text-[#5B6673]'
                        }`}
                        title={r.label}
                      >
                        {r.label}
                      </button>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-[#5B6673]">
                        {pct(r.donePct, 0)}
                      </span>
                    </div>

                    {/* pista cu bara */}
                    <div className="relative h-full" style={{ width: trackW }}>
                      {geom && r.kind === 'project' && (
                        <div
                          className="absolute top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-[#14263F]/15"
                          style={{ left: geom.left, width: geom.width }}
                          title={`${dataRo(r.start!)} – ${dataRo(r.end!)} (calculat din joburi)`}
                        >
                          <div
                            className="h-full rounded-full bg-[#14263F]"
                            style={{ width: `${Math.min(r.donePct, 1) * 100}%` }}
                          />
                        </div>
                      )}
                      {geom && r.kind !== 'project' && (
                        <div
                          onPointerDown={(e) => onBarPointerDown(e, r, 'move')}
                          onPointerMove={onBarPointerMove}
                          onPointerUp={() => onBarPointerUp(r)}
                          className={`group absolute top-1/2 -translate-y-1/2 select-none rounded-lg ${
                            r.kind === 'job' ? 'h-4 bg-[#B9C6D6]' : 'h-5 bg-[#DDEDDC]'
                          } ${r.ghost ? 'border border-dashed border-[#5B6673] !bg-transparent' : ''} ${
                            r.outside ? 'ring-2 ring-[#F0A800]' : ''
                          } ${isDragging ? 'z-30 shadow-lg ring-2 ring-[#58A834]' : ''} cursor-grab active:cursor-grabbing`}
                          style={{ left: geom.left, width: Math.max(geom.width, 6), touchAction: 'none' }}
                          title={`${r.label} · ${dataRo(
                            isDragging && drag
                              ? addDays(range.start, drag.startIdx + (drag.mode !== 'resize-r' ? drag.deltaDays : 0))
                              : r.start!
                          )} – ${dataRo(
                            isDragging && drag
                              ? addDays(range.start, drag.endIdx + (drag.mode !== 'resize-l' ? drag.deltaDays : 0))
                              : r.end!
                          )}${r.ghost ? ' · fără plan propriu (ca jobul) — trage ca să îl setezi' : ''}${
                            r.outside ? ' · în afara intervalului jobului' : ''
                          }`}
                        >
                          {!r.ghost && (
                            <div
                              className={`h-full rounded-lg ${r.kind === 'job' ? 'bg-[#14263F]' : 'bg-[#58A834]'}`}
                              style={{ width: `${Math.min(r.donePct, 1) * 100}%` }}
                            />
                          )}
                          {/* mânerele de redimensionare (zone late, ușor de prins) */}
                          <div
                            onPointerDown={(e) => onBarPointerDown(e, r, 'resize-l')}
                            onPointerMove={onBarPointerMove}
                            onPointerUp={() => onBarPointerUp(r)}
                            className="absolute -left-1 top-0 h-full w-2.5 cursor-ew-resize rounded-l-lg opacity-0 transition-opacity group-hover:opacity-100"
                            style={{ touchAction: 'none' }}
                          >
                            <div className="mx-auto mt-0.5 h-[calc(100%-4px)] w-1 rounded bg-[#0D1A2D]/30" />
                          </div>
                          <div
                            onPointerDown={(e) => onBarPointerDown(e, r, 'resize-r')}
                            onPointerMove={onBarPointerMove}
                            onPointerUp={() => onBarPointerUp(r)}
                            className="absolute -right-1 top-0 h-full w-2.5 cursor-ew-resize rounded-r-lg opacity-0 transition-opacity group-hover:opacity-100"
                            style={{ touchAction: 'none' }}
                          >
                            <div className="mx-auto mt-0.5 h-[calc(100%-4px)] w-1 rounded bg-[#0D1A2D]/30" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <p className="border-t border-[#F3F1EC] px-5 py-2.5 text-xs text-[#5B6673]">
        Trage bara ca să muți · trage capetele ca să scurtezi/lungești · mutarea unui job își mută
        și taskurile · bara de proiect e calculată din joburi · liniuța teal = azi
      </p>
    </div>
  )
}
