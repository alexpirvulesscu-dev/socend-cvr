// Gantt-ul interactiv v3 — construit de la zero, fără librării. Ecran dedicat.
//  - rânduri ierarhice: proiect → joburi → taskuri, pliabile
//  - barele de JOB și TASK se trag (mutare) și se redimensionează de capete,
//    cu „snap" pe zi; bara de PROIECT e calculată din joburi (nu se trage)
//  - mutarea unui job își mută și taskurile; totul optimist + revert la eroare
//  - drag cu Pointer Events + setPointerCapture (nu HTML5 DnD): fără imaginea-
//    fantomă, funcționează și pe touch; în timpul tragerii nu se scrie nimic —
//    doar la eliberare
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EntityPatch, JobWithKpis, ProjectWithKpis, TaskRow } from '../../data/projects'
import { shiftJobWithTasks, updateJobDates, updateTaskDates } from '../../data/mutations'
import { taskPct } from '../../domain/kpi'
import { dataRo, pct } from '../../lib/format'
import { toast } from '../Toast'
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

const LABEL_W = 260
const ROW_H = 40

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
  /** data-țintă de facturare (doar taskuri); un romb pe pistă */
  invoiceDate?: string | null
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
    invoiceDate: t.target_invoice_date,
    projectId: p.id,
    jobId: j.id,
    task: t,
  }
}

/** Construiește rândurile vizibile după proiectul focalizat + starea de pliere. */
function buildRows(
  projects: ProjectWithKpis[],
  focusProjectId: string | undefined,
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

  if (focusProjectId) {
    // un proiect: joburile lui, pliabile la nivel de task
    const p = projects.find((x) => x.id === focusProjectId)
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

// ── Un rând, memoizat ────────────────────────────────────────────────────
// Motivul memoizării: în timpul unei trageri starea se schimbă la fiecare
// pixel. Fără memo, TOATE rândurile + capul de tabel s-ar re-randa pe fiecare
// frame. Cu props stabile (callback-uri din useCallback, rânduri din useMemo),
// se re-randează DOAR rândul tras.
interface RowProps {
  row: GRow
  rangeStart: string
  dayWidth: number
  trackW: number
  today: string
  selected: boolean
  /** indicii de previzualizare — non-null DOAR pentru rândul tras */
  previewStartIdx: number | null
  previewEndIdx: number | null
  onToggleCaret: (key: string) => void
  onPointerDown: (e: React.PointerEvent, r: GRow, mode: DragMode) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: (e: React.PointerEvent, r: GRow) => void
  onPointerCancel: () => void
}

const GanttRow = memo(function GanttRow({
  row: r,
  rangeStart,
  dayWidth,
  trackW,
  today,
  selected,
  previewStartIdx,
  previewEndIdx,
  onToggleCaret,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: RowProps) {
  const isDragging = previewStartIdx !== null && previewEndIdx !== null
  let geom: { left: number; width: number } | null = null
  if (r.start && r.end) {
    const sIdx = previewStartIdx ?? dayIndex(rangeStart, r.start)
    const eIdx = previewEndIdx ?? dayIndex(rangeStart, r.end)
    geom = { left: sIdx * dayWidth, width: (eIdx - sIdx + 1) * dayWidth }
  }
  const previewStart = isDragging ? addDays(rangeStart, previewStartIdx!) : r.start
  const previewEnd = isDragging ? addDays(rangeStart, previewEndIdx!) : r.end
  // ținta de facturare: rombul devine ambru dacă data a trecut (trebuia facturat)
  const invoiceOverdue = r.invoiceDate !== null && r.invoiceDate !== undefined && r.invoiceDate < today

  return (
    <div
      className={`group/row relative z-10 flex items-center border-b border-[#F3F1EC] hover:bg-[#FAF9F6] ${
        selected ? 'bg-[#F1EEE9]' : ''
      }`}
      style={{ height: ROW_H }}
    >
      {/* eticheta din stânga (lipită la scroll orizontal) */}
      <div
        className={`sticky left-0 z-20 flex h-full shrink-0 items-center gap-1 border-r border-[#E8E8E8] pr-2 group-hover/row:bg-[#FAF9F6] ${
          selected ? 'bg-[#F1EEE9]' : 'bg-white'
        }`}
        style={{ width: LABEL_W, paddingLeft: 8 + r.depth * 18 }}
      >
        {r.caret ? (
          <button
            onClick={() => onToggleCaret(r.key)}
            aria-label={r.collapsed ? 'Extinde' : 'Restrânge'}
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
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${
            r.kind === 'project'
              ? 'bg-[#14263F]'
              : r.kind === 'job'
                ? 'bg-[#8798AC]'
                : 'bg-[#C9C5BC]'
          }`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            r.kind === 'project'
              ? 'font-semibold'
              : r.kind === 'job'
                ? 'font-medium'
                : 'text-[#5B6673]'
          }`}
          title={r.label}
        >
          {r.label}
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-[#5B6673]">
          {pct(r.donePct, 0)}
        </span>
      </div>

      {/* pista cu bara */}
      <div className="relative h-full" style={{ width: trackW }}>
        {geom && r.kind === 'project' && (
          <div
            className="absolute top-1/2 h-2.5 -translate-y-1/2 overflow-hidden rounded-full bg-[#14263F]/15"
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
            onPointerDown={(e) => onPointerDown(e, r, 'move')}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerUp(e, r)}
            onPointerCancel={onPointerCancel}
            className={`group absolute top-1/2 -translate-y-1/2 select-none rounded-lg ${
              r.kind === 'job' ? 'h-5 bg-[#B9C6D6]' : 'h-6 bg-[#EEECE7]'
            } ${r.ghost ? 'border border-dashed border-[#8798AC] !bg-transparent' : 'shadow-[0_1px_2px_rgba(13,26,45,0.10)]'} ${
              r.outside ? 'ring-2 ring-[#F0A800]' : ''
            } ${isDragging ? 'z-10 shadow-lg ring-2 ring-[#14263F]' : ''} cursor-grab active:cursor-grabbing`}
            style={{ left: geom.left, width: Math.max(geom.width, 6), touchAction: 'none' }}
            title={`${r.label} · ${dataRo(previewStart!)} – ${dataRo(previewEnd!)}${
              r.ghost ? ' · fără plan propriu (ca jobul) — trage ca să îl setezi' : ''
            }${r.outside ? ' · în afara intervalului jobului' : ''}`}
          >
            {!r.ghost && (
              <div
                className={`h-full rounded-lg ${r.kind === 'job' ? 'bg-[#14263F]' : 'bg-[#58A834]'}`}
                style={{ width: `${Math.min(r.donePct, 1) * 100}%` }}
              />
            )}
            {isDragging && (
              <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-[#14263F] px-1.5 py-0.5 text-[10px] font-medium text-white">
                {dataRo(previewStart!)} – {dataRo(previewEnd!)}
              </span>
            )}
            <div
              onPointerDown={(e) => onPointerDown(e, r, 'resize-l')}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, r)}
              onPointerCancel={onPointerCancel}
              className="absolute -left-1 top-0 h-full w-2.5 cursor-ew-resize rounded-l-lg opacity-0 transition-opacity group-hover:opacity-100"
              style={{ touchAction: 'none' }}
            >
              <div className="mx-auto mt-1 h-[calc(100%-8px)] w-1 rounded bg-[#0D1A2D]/25" />
            </div>
            <div
              onPointerDown={(e) => onPointerDown(e, r, 'resize-r')}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, r)}
              onPointerCancel={onPointerCancel}
              className="absolute -right-1 top-0 h-full w-2.5 cursor-ew-resize rounded-r-lg opacity-0 transition-opacity group-hover:opacity-100"
              style={{ touchAction: 'none' }}
            >
              <div className="mx-auto mt-1 h-[calc(100%-8px)] w-1 rounded bg-[#0D1A2D]/25" />
            </div>
          </div>
        )}
        {/* ținta de facturare — romb; ambru dacă data a trecut */}
        {r.kind === 'task' && r.invoiceDate && r.invoiceDate >= rangeStart && (
          <div
            className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white ${
              invoiceOverdue ? 'bg-[#F0A800]' : 'bg-[#14263F]'
            }`}
            style={{ left: dayIndex(rangeStart, r.invoiceDate) * dayWidth + dayWidth / 2 }}
            title={`Facturare țintă · ${dataRo(r.invoiceDate)}${
              invoiceOverdue ? ' · data a trecut' : ''
            }`}
          />
        )}
      </div>
    </div>
  )
})

export function GanttChart({
  projects,
  focusProjectId,
  onFocusProject,
  patchEntity,
  today,
}: {
  projects: ProjectWithKpis[]
  focusProjectId: string | undefined
  onFocusProject: (id: string | undefined) => void
  patchEntity: (p: EntityPatch) => void
  today: string
}) {
  const [zoom, setZoom] = useState<ZoomLevel>('luna')
  const [lookahead, setLookahead] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Starea de tragere stă într-un REF (sursa de adevăr pentru handlere), iar în
  // state se pune doar minimul de care are nevoie randarea: ce rând e tras și
  // între ce zile. Așa, la fiecare frame se re-randează UN singur rând.
  const dragRef = useRef<DragState | null>(null)
  const [dragView, setDragView] = useState<{
    key: string
    startIdx: number
    endIdx: number
  } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dayWidth = ZOOM_LEVELS[zoom]

  // proiectele oferite în selector (active mari + mici; nu finalizate)
  const pickable = useMemo(() => projects.filter((p) => p.active), [projects])

  // starea implicită de pliere depinde de scop: în portofoliu, joburile stau
  // pliate (vezi proiectele + joburile); într-un proiect, joburile sunt desfăcute
  const scopeKey = focusProjectId ?? ''
  useEffect(() => {
    if (!focusProjectId) {
      const jobKeys = projects
        .filter((p) => p.active)
        .flatMap((p) => p.jobs.map((j) => `j:${j.id}`))
      setCollapsed(new Set(jobKeys))
    } else {
      setCollapsed(new Set())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  const allRows = useMemo(
    () => buildRows(projects, focusProjectId, collapsed),
    [projects, focusProjectId, collapsed]
  )

  // filtrul „următoarele 2 săptămâni": doar rândurile care ating fereastra
  const laEnd = addDays(today, 13)
  const rows = useMemo(
    () =>
      lookahead
        ? allRows.filter(
            (r) => r.start !== null && r.end !== null && r.start <= laEnd && r.end >= today
          )
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

  const saturdays = useMemo(() => {
    if (dayWidth < 10) return []
    const out: number[] = []
    for (let i = 0; i < range.days; i++) {
      if (weekdayIndex(addDays(range.start, i)) === 5) out.push(i)
    }
    return out
  }, [range, dayWidth])

  const weekStarts = useMemo(() => {
    const out: number[] = []
    for (let i = 0; i < range.days; i++) {
      if (weekdayIndex(addDays(range.start, i)) === 0) out.push(i)
    }
    return out
  }, [range])

  const todayX = dayIndex(range.start, today) * dayWidth

  function jumpToToday() {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ left: Math.max(0, todayX - (el.clientWidth - LABEL_W) / 2.2), behavior: 'smooth' })
  }

  // derulează la „azi" DOAR când se schimbă scopul sau zoom-ul — nu la fiecare
  // recalcul de fereastră (ar smulge scroll-ul din mână în timpul unei trageri)
  const scrolledFor = useRef('')
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const key = `${scopeKey}|${zoom}`
    if (scrolledFor.current === key) return
    scrolledFor.current = key
    el.scrollLeft = Math.max(0, todayX - (el.clientWidth - LABEL_W) / 3)
  }, [range.start, dayWidth, todayX, scopeKey, zoom])

  // Escape anulează tragerea în curs
  useEffect(() => {
    if (!dragView) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragRef.current = null
        setDragView(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dragView])

  const toggleCaret = useCallback((key: string) => {
    setCollapsed((old) => {
      const next = new Set(old)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /** Comite mutarea/redimensionarea la eliberarea barei — optimist + revert. */
  const commitDrag = useCallback((d: DragState, rangeStart: string) => {
    const newStart = addDays(rangeStart, d.startIdx + (d.mode !== 'resize-r' ? d.deltaDays : 0))
    const newEnd = addDays(rangeStart, d.endIdx + (d.mode !== 'resize-l' ? d.deltaDays : 0))
    const r = d.row

    if (r.kind === 'task' && r.task) {
      const t = r.task
      patchEntity({ kind: 'task', id: t.id, patch: { start_date: newStart, end_date: newEnd } })
      updateTaskDates(t.id, newStart, newEnd).catch((e: Error) => {
        patchEntity({
          kind: 'task',
          id: t.id,
          patch: { start_date: t.start_date, end_date: t.end_date },
        })
        toast(`Nu s-a salvat: ${e.message}`)
      })
      return
    }

    if (r.kind === 'job' && r.job) {
      const j = r.job
      if (d.mode === 'move') {
        // jobul se mută cu tot cu taskurile lui. Se deplasează DOAR datele pe
        // care taskul le are cu adevărat: o latură null („ca jobul") rămâne null.
        const delta = d.deltaDays
        const shifted = j.tasks
          .filter((t) => t.start_date !== null || t.end_date !== null)
          .map((t) => ({
            id: t.id,
            startDate: t.start_date ? addDays(t.start_date, delta) : null,
            endDate: t.end_date ? addDays(t.end_date, delta) : null,
          }))
        patchEntity({ kind: 'job', id: j.id, patch: { start_date: newStart, end_date: newEnd } })
        for (const s of shifted)
          patchEntity({
            kind: 'task',
            id: s.id,
            patch: { start_date: s.startDate, end_date: s.endDate },
          })
        shiftJobWithTasks(j.id, { startDate: newStart, endDate: newEnd }, shifted).catch(
          (e: Error) => {
            patchEntity({
              kind: 'job',
              id: j.id,
              patch: { start_date: j.start_date, end_date: j.end_date },
            })
            for (const t of j.tasks)
              patchEntity({
                kind: 'task',
                id: t.id,
                patch: { start_date: t.start_date, end_date: t.end_date },
              })
            toast(`Nu s-a salvat: ${e.message}`)
          }
        )
      } else {
        patchEntity({ kind: 'job', id: j.id, patch: { start_date: newStart, end_date: newEnd } })
        updateJobDates(j.id, newStart, newEnd).catch((e: Error) => {
          patchEntity({
            kind: 'job',
            id: j.id,
            patch: { start_date: j.start_date, end_date: j.end_date },
          })
          toast(`Nu s-a salvat: ${e.message}`)
        })
      }
    }
  }, [patchEntity])

  // Handlerele sunt STABILE (useCallback) ca memo-ul rândurilor să funcționeze;
  // starea vie a tragerii trăiește în dragRef, nu în props.
  const rangeStart = range.start
  const onBarPointerDown = useCallback(
    (e: React.PointerEvent, r: GRow, mode: DragMode) => {
      if (!r.editable || !r.start || !r.end) return
      if (e.button !== 0) return
      e.stopPropagation()
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      const startIdx = dayIndex(rangeStart, r.start)
      const endIdx = dayIndex(rangeStart, r.end)
      dragRef.current = { row: r, mode, originX: e.clientX, startIdx, endIdx, deltaDays: 0, moved: false }
      setDragView({ key: r.key, startIdx, endIdx })
    },
    [rangeStart]
  )

  const onBarPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const raw = pxToDeltaDays(e.clientX - drag.originX, dayWidth)
      let d = raw
      if (drag.mode === 'resize-l') d = Math.min(raw, drag.endIdx - drag.startIdx)
      if (drag.mode === 'resize-r') d = Math.max(raw, drag.startIdx - drag.endIdx)
      drag.moved = drag.moved || Math.abs(e.clientX - drag.originX) > 4
      if (d === drag.deltaDays) return // aceeași zi → nicio re-randare
      drag.deltaDays = d
      setDragView({
        key: drag.row.key,
        startIdx: drag.startIdx + (drag.mode !== 'resize-r' ? d : 0),
        endIdx: drag.endIdx + (drag.mode !== 'resize-l' ? d : 0),
      })
    },
    [dayWidth]
  )

  const onBarPointerUp = useCallback(
    (e: React.PointerEvent, r: GRow) => {
      // pointerup-ul retargetat pe mâner BULEȘTE spre bară — fără stopPropagation
      // comiterea ar rula de două ori (două scrieri Supabase pe fiecare resize)
      e.stopPropagation()
      const drag = dragRef.current
      if (!drag) return
      if (drag.deltaDays === 0) {
        if (r.caret) toggleCaret(r.key) // click pe o bară-părinte pliază/desface
      } else if (drag.moved) {
        commitDrag(drag, rangeStart)
      }
      dragRef.current = null
      setDragView(null)
    },
    [commitDrag, rangeStart, toggleCaret]
  )

  const onBarPointerCancel = useCallback(() => {
    dragRef.current = null
    setDragView(null)
  }, [])

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

  const legendChip = (cls: string, label: string) => (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-4 rounded-full ${cls}`} />
      {label}
    </span>
  )

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(13,26,45,0.04),0_8px_24px_rgba(13,26,45,0.06)]">
      {/* bara de comandă */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F3F1EC] px-5 py-3">
        <div className="flex items-center gap-3">
          <select
            value={focusProjectId ?? ''}
            onChange={(e) => onFocusProject(e.target.value || undefined)}
            className="cursor-pointer rounded-full border border-[#E8E8E8] bg-white px-3.5 py-1.5 text-sm font-medium outline-none hover:border-[#58A834]"
          >
            <option value="">Toate proiectele active</option>
            {pickable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={jumpToToday}
            className="rounded-full bg-[#EEECE7] px-3.5 py-1.5 text-sm font-medium text-[#5B6673] hover:text-[#0D1A2D]"
          >
            Azi
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setLookahead((l) => !l)}
            className={`mr-2 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              lookahead
                ? 'bg-[#14263F] text-white'
                : 'bg-[#EEECE7] text-[#5B6673] hover:text-[#0D1A2D]'
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
        <p className="px-5 py-16 text-center text-sm text-[#5B6673]">
          {lookahead
            ? 'Nimic planificat în următoarele 2 săptămâni.'
            : 'Niciun rând de arătat — alege un proiect sau adaugă joburi.'}
        </p>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div style={{ width: LABEL_W + trackW, minWidth: '100%' }}>
            {/* axa de timp — lipită sus */}
            <div className="sticky top-0 z-30 bg-white">
              <div className="flex">
                <div
                  className="sticky left-0 z-10 flex shrink-0 items-end border-r border-[#E8E8E8] bg-white px-3 pb-1"
                  style={{ width: LABEL_W }}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                    Proiect · Job · Task
                  </span>
                </div>
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
              <div className="flex border-b border-[#E8E8E8]">
                <div className="sticky left-0 z-10 shrink-0 bg-white" style={{ width: LABEL_W }} />
                <div className="relative h-5" style={{ width: trackW }}>
                  {zoom === 'saptamana' &&
                    Array.from({ length: range.days }, (_, i) => (
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
                    ))}
                  {zoom === 'luna' &&
                    weekStarts.map((i) => (
                      <span
                        key={i}
                        className="absolute top-0 border-l border-[#EEECE7] pl-1 text-[10px] tabular-nums text-[#5B6673]"
                        style={{ left: i * dayWidth, width: 7 * dayWidth }}
                      >
                        {Number(addDays(range.start, i).slice(8))}
                      </span>
                    ))}
                  {/* fanionul „Azi" */}
                  <span
                    className="absolute -top-0 z-10 -translate-x-1/2 rounded-full bg-[#14263F] px-1.5 text-[9px] font-bold uppercase tracking-wider text-white"
                    style={{ left: todayX + dayWidth / 2 }}
                  >
                    azi
                  </span>
                </div>
              </div>
            </div>

            {/* corpul: rândurile cu bare */}
            <div className="relative">
              {/* weekenduri + fereastra lookahead + linia de azi, pe toată înălțimea */}
              <div
                className="pointer-events-none absolute inset-y-0 z-0"
                style={{ left: LABEL_W, width: trackW }}
              >
                {saturdays.map((i) => (
                  <div
                    key={i}
                    className="absolute inset-y-0 bg-[#F6F4EF]"
                    style={{ left: i * dayWidth, width: 2 * dayWidth }}
                  />
                ))}
                {lookahead && (
                  <div
                    className="absolute inset-y-0 bg-[#DDEDDC]/40"
                    style={{ left: todayX, width: 14 * dayWidth }}
                  />
                )}
                <div
                  className="absolute inset-y-0 w-0.5 bg-[#14263F]"
                  style={{ left: todayX + dayWidth / 2 }}
                  title={`Azi · ${dataRo(today)}`}
                />
              </div>

              {rows.map((r) => {
                const dragging = dragView?.key === r.key
                return (
                  <GanttRow
                    key={r.key}
                    row={r}
                    rangeStart={range.start}
                    dayWidth={dayWidth}
                    trackW={trackW}
                    today={today}
                    selected={false}
                    previewStartIdx={dragging ? dragView!.startIdx : null}
                    previewEndIdx={dragging ? dragView!.endIdx : null}
                    onToggleCaret={toggleCaret}
                    onPointerDown={onBarPointerDown}
                    onPointerMove={onBarPointerMove}
                    onPointerUp={onBarPointerUp}
                    onPointerCancel={onBarPointerCancel}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* legenda + indiciile */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[#F3F1EC] px-5 py-2.5 text-xs text-[#5B6673]">
        {legendChip('bg-[#14263F]', 'proiect / job')}
        {legendChip('bg-[#58A834]', 'task')}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full border border-dashed border-[#8798AC]" />
          fără plan propriu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-full ring-2 ring-[#F0A800]" />
          în afara jobului
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 bg-[#115468]" />
          facturare țintă
        </span>
        <span className="ml-auto">
          Trage bara ca să muți · trage capetele ca să scurtezi/lungești · mutarea unui job îi mută
          și taskurile
        </span>
      </div>
    </div>
  )
}
