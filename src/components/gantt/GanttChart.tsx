// Gantt-ul interactiv — ecranul „Program". Construit de la zero, fără librării.
//  - rânduri ierarhice: proiect → joburi → taskuri, pliabile
//  - barele de JOB și TASK se trag (mutare) și se redimensionează de capete,
//    cu „snap" pe zi; bara de PROIECT e calculată din joburi (nu se trage)
//  - mutarea unui job își mută și taskurile; totul optimist + revert la eroare
//  - drag cu Pointer Events + setPointerCapture (nu HTML5 DnD): fără imaginea-
//    fantomă, funcționează și pe touch; în timpul tragerii nu se scrie nimic —
//    doar la eliberare
//
// Pielea (Clean Ledger): fiecare rând are numele pe un rând și o linie de meta
// dedesubt, bara e o singură pistă rotunjită din trei segmente (realizat →
// în urmă → planificat), iar ultima coloană e marja rândului.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EntityPatch, JobWithKpis, ProjectWithKpis, TaskRow } from '../../data/projects'
import { shiftJobWithTasks, updateJobDates, updateTaskDates } from '../../data/mutations'
import {
  behindDays as behindDaysOf,
  durationDays,
  marginColor,
  planPct as planFraction,
  taskPct,
} from '../../domain/kpi'
import { DASH, dataRo, dataScurt, lunaScurt, pct } from '../../lib/format'
import { lunaCurenta } from '../Shell'
import { EmptyState, GhostButton, KpiPill, SegmentedControl, scheduleText } from '../ui'
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

const LABEL_W = 300
const MARGIN_W = 92
const ROW_H = 52
/** înălțimea benzii de axă (luni + zile) */
const HEAD_H = 46
/** zona de prindere a barei: mai înaltă decât bara, ca să fie ușor de apucat */
const GRIP_H = 20

const ZOOM_OPTIONS: { value: ZoomLevel; label: string }[] = [
  { value: 'saptamana', label: 'Săptămână' },
  { value: 'luna', label: 'Lună' },
  { value: 'trimestru', label: 'Trimestru' },
]

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
  /** cât ar trebui să fie realizat azi, după plan */
  planPct: number
  /** pozitiv = în urmă, negativ = în avans */
  behindDays: number
  /** marja rândului; null = încă nu există EV, deci nu există marjă */
  margin: number | null
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

function clamp01(n: number): number {
  return Math.min(Math.max(n, 0), 1)
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

/** Linia de meta de sub nume: „apr. – oct. · 65,0% realizat · 2,0 zile în urmă". */
function metaLine(r: GRow): string {
  const window = r.start && r.end ? `${lunaScurt(r.start)} – ${lunaScurt(r.end)}` : DASH
  return `${window} · ${pct(clamp01(r.donePct))} realizat · ${scheduleText(r.behindDays)}`
}

function taskRowOf(
  p: ProjectWithKpis,
  j: JobWithKpis,
  t: TaskRow,
  depth: 0 | 1 | 2,
  today: string
): GRow {
  const start = t.start_date ?? j.start_date
  const end = t.end_date ?? j.end_date
  const outside =
    (t.start_date !== null && t.start_date < j.start_date) ||
    (t.end_date !== null && t.end_date > j.end_date)
  const done = taskDone(t)
  const plan = planFraction(start, end, today)
  return {
    key: `t:${t.id}`,
    kind: 'task',
    id: t.id,
    label: t.name,
    depth,
    start,
    end,
    donePct: done,
    planPct: plan,
    behindDays: behindDaysOf(plan, done, durationDays(start, end)),
    // costul nu se ține pe task, deci taskul nu are marjă proprie
    margin: null,
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
  collapsed: Set<string>,
  today: string
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
    planPct: j.kpis.planPct,
    behindDays: j.kpis.behindDays,
    margin: j.kpis.ev > 0 ? j.kpis.margin : null,
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
      if (!r.collapsed) for (const t of j.tasks) rows.push(taskRowOf(p, j, t, 1, today))
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
      planPct: p.kpis.planPct,
      behindDays: p.kpis.behindDays,
      margin: p.kpis.ev > 0 ? p.kpis.margin : null,
      editable: false, // fereastra proiectului e calculată din joburi
      caret: p.jobs.length > 0,
      collapsed: pCollapsed,
      projectId: p.id,
    })
    if (!pCollapsed) {
      for (const j of p.jobs) {
        const r = jobRow(p, j, 1)
        rows.push(r)
        if (!r.collapsed) for (const t of j.tasks) rows.push(taskRowOf(p, j, t, 2, today))
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

/**
 * Pista unui rând: un singur cilindru din trei segmente — realizat (verde),
 * ce trebuia realizat până azi și nu e (chihlimbar), restul duratei (gol).
 */
function BarSegments({ donePct, planPct }: { donePct: number; planPct: number }) {
  const done = clamp01(donePct) * 100
  const plan = clamp01(planPct) * 100
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-track">
      {plan > done && (
        <div className="absolute inset-y-0 left-0 bg-warn-soft" style={{ width: `${plan}%` }} />
      )}
      <div className="absolute inset-y-0 left-0 bg-pos-fill" style={{ width: `${done}%` }} />
    </div>
  )
}

/** Mânerul de redimensionare: invizibil până la hover pe bară. */
function ResizeGrip() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center opacity-0 transition-opacity duration-[120ms] ease-std group-hover:opacity-100"
    >
      <span className="mx-auto h-3 w-1 rounded-full bg-ink-3" />
    </span>
  )
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
  // ținta de facturare: rombul devine roșu dacă data a trecut (trebuia facturat)
  const invoiceOverdue = r.invoiceDate !== null && r.invoiceDate !== undefined && r.invoiceDate < today
  // fundalul rândului se ține pe trei locuri (rând + cele două celule lipite),
  // ca hover-ul și selecția să nu se rupă la derularea orizontală
  const cellBg = selected ? 'bg-accent-soft' : 'bg-paper-0 group-hover/row:bg-paper-1'

  return (
    <div
      className={`group/row relative z-10 flex items-stretch border-b border-line-1 last:border-b-0 ${
        selected ? 'bg-accent-soft' : 'hover:bg-paper-1'
      }`}
      style={{ height: ROW_H }}
    >
      {/* numele + linia de meta (lipite la scroll orizontal) */}
      <div
        className={`sticky left-0 z-20 flex h-full shrink-0 items-center gap-1.5 border-r border-line-1 pr-3 ${cellBg}`}
        style={{ width: LABEL_W, paddingLeft: 10 + r.depth * 16 }}
      >
        {r.caret ? (
          <button
            onClick={() => onToggleCaret(r.key)}
            aria-label={r.collapsed ? 'Extinde' : 'Restrânge'}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-chip text-ink-3 transition-colors duration-[120ms] ease-std hover:bg-segment hover:text-ink-1"
          >
            <span
              aria-hidden
              className={`text-row transition-transform duration-[120ms] ease-std ${
                r.collapsed ? '' : 'rotate-90'
              }`}
            >
              ›
            </span>
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-row ${
              r.kind === 'project' ? 'font-semibold text-ink-1' : 'font-medium text-ink-2'
            }`}
            title={r.label}
          >
            {r.label}
          </span>
          <span className="mt-0.5 block truncate text-meta font-medium text-ink-3">
            {metaLine(r)}
          </span>
        </span>
      </div>

      {/* pista cu bara */}
      <div className="relative h-full shrink-0" style={{ width: trackW }}>
        {geom && r.kind === 'project' && (
          <div
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: geom.left, width: Math.max(geom.width, 8) }}
            title={`${dataRo(r.start!)} – ${dataRo(r.end!)} (calculat din joburi)`}
          >
            <BarSegments donePct={r.donePct} planPct={r.planPct} />
          </div>
        )}
        {geom && r.kind !== 'project' && (
          <div
            onPointerDown={(e) => onPointerDown(e, r, 'move')}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => onPointerUp(e, r)}
            onPointerCancel={onPointerCancel}
            className={`group absolute top-1/2 flex -translate-y-1/2 cursor-grab select-none items-center active:cursor-grabbing ${
              isDragging ? 'z-20' : ''
            }`}
            style={{
              left: geom.left,
              width: Math.max(geom.width, 8),
              height: GRIP_H,
              touchAction: 'none',
            }}
            title={`${r.label} · ${dataRo(previewStart!)} – ${dataRo(previewEnd!)}${
              r.ghost ? ' · fără plan propriu (ca jobul) — trage ca să îl setezi' : ''
            }${r.outside ? ' · în afara intervalului jobului' : ''}`}
          >
            <div
              className={`w-full ${r.outside ? 'rounded-full ring-2 ring-warn' : ''} ${
                isDragging ? 'rounded-full ring-2 ring-ink-1' : ''
              }`}
            >
              {r.ghost ? (
                <div className="h-2.5 w-full rounded-full border border-dashed border-line-3" />
              ) : (
                <BarSegments donePct={r.donePct} planPct={r.planPct} />
              )}
            </div>
            {isDragging && (
              <span className="absolute -top-5 left-0 whitespace-nowrap rounded-chip bg-ink-1 px-1.5 py-0.5 text-meta font-semibold text-paper-0">
                {dataRo(previewStart!)} – {dataRo(previewEnd!)}
              </span>
            )}
            <div
              onPointerDown={(e) => onPointerDown(e, r, 'resize-l')}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, r)}
              onPointerCancel={onPointerCancel}
              className="absolute -left-1 top-0 h-full w-2.5 cursor-ew-resize"
              style={{ touchAction: 'none' }}
            >
              <ResizeGrip />
            </div>
            <div
              onPointerDown={(e) => onPointerDown(e, r, 'resize-r')}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, r)}
              onPointerCancel={onPointerCancel}
              className="absolute -right-1 top-0 h-full w-2.5 cursor-ew-resize"
              style={{ touchAction: 'none' }}
            >
              <ResizeGrip />
            </div>
          </div>
        )}
        {/* ținta de facturare — romb plin; roșu dacă data a trecut */}
        {r.kind === 'task' && r.invoiceDate && r.invoiceDate >= rangeStart && (
          <div
            className={`absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-paper-0 ${
              invoiceOverdue ? 'bg-neg' : 'bg-ink-1'
            }`}
            style={{ left: dayIndex(rangeStart, r.invoiceDate) * dayWidth + dayWidth / 2 }}
            title={`Facturare țintă · ${dataRo(r.invoiceDate)}${
              invoiceOverdue ? ' · data a trecut' : ''
            }`}
          />
        )}
      </div>

      {/* marja rândului (lipită la dreapta) */}
      <div
        className={`sticky right-0 z-20 flex h-full shrink-0 items-center justify-end border-l border-line-1 px-3 ${cellBg}`}
        style={{ width: MARGIN_W }}
      >
        {r.margin === null ? (
          <span className="text-row font-medium text-ink-4">{DASH}</span>
        ) : (
          <KpiPill color={marginColor(r.margin)}>{pct(r.margin)}</KpiPill>
        )}
      </div>
    </div>
  )
})

/** Un pătrățel de legendă: culoarea + ce înseamnă. */
function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  )
}

export function GanttChart({
  projects,
  focusProjectId,
  onFocusProject,
  patchEntity,
  today,
  embedded = false,
}: {
  projects: ProjectWithKpis[]
  focusProjectId: string | undefined
  onFocusProject: (id: string | undefined) => void
  patchEntity: (p: EntityPatch) => void
  today: string
  /** în pagina unui proiect: filtrul de proiect e al paginii, nu al graficului */
  embedded?: boolean
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
    () => buildRows(projects, focusProjectId, collapsed, today),
    [projects, focusProjectId, collapsed, today]
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

  const innerW = LABEL_W + trackW + MARGIN_W

  return (
    <div className="flex h-full flex-col gap-3">
      {/* bara de comandă: scopul + fereastra vizibilă + zoom-ul */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!embedded && (
            <select
              value={focusProjectId ?? ''}
              onChange={(e) => onFocusProject(e.target.value || undefined)}
              aria-label="Proiect"
              className="cursor-pointer rounded-btn border border-line-3 bg-paper-0 px-3 py-[9px] text-row font-semibold text-ink-2 transition-colors duration-[120ms] ease-std hover:bg-paper-1"
            >
              <option value="">Toate proiectele active</option>
              {pickable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <GhostButton onClick={jumpToToday}>Azi</GhostButton>
          <button
            type="button"
            aria-pressed={lookahead}
            onClick={() => setLookahead((l) => !l)}
            className={`rounded-btn border px-3 py-[9px] text-row font-semibold transition-colors duration-[120ms] ease-std ${
              lookahead
                ? 'border-accent bg-accent-soft text-accent-ink'
                : 'border-line-3 bg-paper-0 text-ink-2 hover:bg-paper-1'
            }`}
          >
            Următoarele 2 săptămâni
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line-2 bg-paper-0 px-3 py-1.5 text-row font-semibold text-ink-2">
            {lunaCurenta(range.start)} – {lunaCurenta(range.end)}
          </span>
          <SegmentedControl options={ZOOM_OPTIONS} value={zoom} onChange={setZoom} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line-2 bg-paper-0 shadow-e1">
        {rows.length === 0 ? (
          <EmptyState title="Nimic de arătat">
            {lookahead
              ? 'Nimic planificat în următoarele 2 săptămâni.'
              : 'Niciun rând de arătat — alege un proiect sau adaugă joburi.'}
          </EmptyState>
        ) : (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
            <div style={{ width: innerW, minWidth: '100%' }}>
              {/* axa de timp — lipită sus */}
              <div className="sticky top-0 z-30 flex border-b border-line-2 bg-paper-0">
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-end border-r border-line-1 bg-paper-0 px-3 pb-2"
                  style={{ width: LABEL_W, height: HEAD_H }}
                >
                  <span className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
                    Proiect · Job · Task
                  </span>
                </div>
                <div className="relative shrink-0" style={{ width: trackW, height: HEAD_H }}>
                  {/* banda lunilor */}
                  {months.map((m) => (
                    <span
                      key={m.label + m.startIdx}
                      className="absolute top-2 truncate border-l border-line-2 pl-1.5 text-th font-semibold uppercase tracking-[0.07em] text-ink-3"
                      style={{ left: m.startIdx * dayWidth, width: m.days * dayWidth }}
                    >
                      {m.days * dayWidth > 44 ? m.label : ''}
                    </span>
                  ))}
                  {/* banda zilelor / săptămânilor */}
                  {zoom === 'saptamana' &&
                    Array.from({ length: range.days }, (_, i) => (
                      <span
                        key={i}
                        className={`absolute bottom-1 text-center text-meta font-medium tabular-nums ${
                          weekdayIndex(addDays(range.start, i)) >= 5 ? 'text-ink-4' : 'text-ink-3'
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
                        className="absolute bottom-1 border-l border-line-1 pl-1 text-meta font-medium tabular-nums text-ink-4"
                        style={{ left: i * dayWidth, width: 7 * dayWidth }}
                      >
                        {Number(addDays(range.start, i).slice(8))}
                      </span>
                    ))}
                  {/* eticheta zilei de azi, exact deasupra liniei roșii */}
                  <span
                    className="absolute top-2 z-10 -translate-x-1/2 whitespace-nowrap bg-paper-0 px-1 text-meta font-semibold text-neg"
                    style={{ left: todayX + dayWidth / 2 }}
                  >
                    {dataScurt(today)}
                  </span>
                </div>
                <div
                  className="sticky right-0 z-20 flex shrink-0 items-end justify-end border-l border-line-1 bg-paper-0 px-3 pb-2"
                  style={{ width: MARGIN_W, height: HEAD_H }}
                >
                  <span className="text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
                    Marjă
                  </span>
                </div>
              </div>

              {/* corpul: rândurile cu bare */}
              <div className="relative">
                {/* caroiajul lunilor + fereastra lookahead + linia de azi */}
                <div
                  className="pointer-events-none absolute inset-y-0 z-0"
                  style={{ left: LABEL_W, width: trackW }}
                >
                  {months.map((m) => (
                    <div
                      key={`g${m.startIdx}`}
                      className="absolute inset-y-0 w-px bg-grid"
                      style={{ left: m.startIdx * dayWidth }}
                    />
                  ))}
                  {lookahead && (
                    <div
                      className="absolute inset-y-0 bg-accent-soft"
                      style={{ left: todayX, width: 14 * dayWidth }}
                    />
                  )}
                  <div
                    className="absolute inset-y-0 border-l border-dashed border-neg"
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-2 bg-paper-1 px-5 py-2.5 text-meta font-medium text-ink-4">
          <LegendItem
            swatch={<span aria-hidden className="h-2 w-4 rounded-full bg-pos-fill" />}
            label="Realizat"
          />
          <LegendItem
            swatch={<span aria-hidden className="h-2 w-4 rounded-full bg-warn-soft" />}
            label="În urmă"
          />
          <LegendItem
            swatch={<span aria-hidden className="h-2 w-4 rounded-full bg-track" />}
            label="Planificat"
          />
          <LegendItem
            swatch={<span aria-hidden className="h-2 w-2 rotate-45 bg-ink-1" />}
            label="Reper"
          />
          <LegendItem
            swatch={<span aria-hidden className="h-3 border-l border-dashed border-neg" />}
            label="Azi"
          />
          <span className="ml-auto">
            Trage bara ca să muți · trage capetele ca să scurtezi/lungești · mutarea unui job îi
            mută și taskurile
          </span>
        </div>
      </div>
    </div>
  )
}
