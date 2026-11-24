// Fila „Tracker" a unui proiect: execuția pe traseu (primul: Peștișani VJ36-VJ80).
//  · Cum stăm azi: puncte de control. „Cu săpătura am ajuns la VJ47" bifează
//    porțiunile până acolo; ziua bifei rămâne discret pe fiecare porțiune.
//    Se numără doar ce e terminat.
//  · Jurnal zilnic: o singură foaie, un rând pe zi, cantitățile din Excel.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  boundaries,
  checkpointPlan,
  defaultFrom,
  isDone,
  markMap,
  segmentLabel,
  segmentState,
  stagesFor,
  summarize,
  workProgress,
  STARE_LABEL,
  type Marks,
  type Segment,
  type Stare,
  type TrackerConfig,
} from '../../domain/tracker'
import {
  azi,
  saveCheckpoint,
  setMark,
  updatePoint,
  useTracker,
  type PointRow,
  type TrackerData,
} from '../../data/tracker'
import { color } from '../../design/tokens'
import { dataRo, num } from '../../lib/format'
import {
  Card,
  ErrorStrip,
  GhostButton,
  Modal,
  Pill,
  PrimaryButton,
  SegmentedControl,
  Skeleton,
  type Tone,
} from '../../components/ui'
import { toast } from '../../components/Toast'
import { JurnalZilnic, LucrareAditionalaModal } from './TrackerJurnal'

// Culorile de stare, ca pe pagina Peștișani: albastru = gata, galben = în lucru, gri = neînceput.
// Culoarea porțiunii pe traseu vine din tipul de lucrare (mediul), nu din stare.
const STARE_FILL: Record<Stare, string> = { done: color.infoFill, ip: color.warnFill, ns: color.line3 }
const STARE_TONE: Record<Stare, Tone> = { done: 'info', ip: 'warn', ns: 'neutral' }

const m1 = (n: number) => `${num(n, 1)} m`
const zz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

const inputCls =
  'h-10 w-full rounded-btn border border-line-2 bg-paper-0 px-3 text-row text-ink-1 hover:border-line-3 focus:border-accent'

function stageLabel(cfg: TrackerConfig, id: string): string {
  return cfg.stages.find((s) => s.id === id)?.label ?? id
}

// ── Harta traseului ─────────────────────────────────────────────────────

/** Rândurile hărții: câți metri încap pe un rând după lățimea ecranului. */
function rowsFor(segments: Segment[], width: number): Segment[][] {
  const target = width >= 1400 ? 300 : width >= 1000 ? 220 : width >= 700 ? 150 : 95
  const groups: Segment[][] = []
  for (const s of segments) {
    const last = groups[groups.length - 1]
    if (last && last[0].from_pt === s.from_pt) last.push(s)
    else groups.push([s])
  }
  const rows: Segment[][] = []
  let cur: Segment[] = []
  let sum = 0
  groups.forEach((g, i) => {
    cur.push(...g)
    sum += g.reduce((s, x) => s + Number(x.length_m), 0)
    if (sum >= target && groups.length - (i + 1) > 1) {
      rows.push(cur)
      cur = []
      sum = 0
    }
  })
  if (cur.length) rows.push(cur)
  return rows
}

function Traseu({
  data,
  mm,
  view,
  front,
  onSegment,
  onPoint,
}: {
  data: TrackerData
  mm: Marks
  view: string
  /** frontul lucrării afișate (doar când e aleasă o lucrare) */
  front: string | null
  onSegment: (s: Segment & { id: string }) => void
  onPoint: (p: PointRow) => void
}) {
  const cfg = data.tracker.config
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(900)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver((e) => setW(Math.max(320, Math.round(e[0].contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const pins = new Map(data.points.filter((p) => p.at_pt).map((p) => [p.at_pt!, p]))
  const typeColor = (k: string) => cfg.types.find((t) => t.id === k)?.color ?? color.ink4
  const rows = rowsFor(data.segments, W)

  return (
    <div ref={box} className="grid">
      {rows.map((segs, ri) => {
        const X0 = 26
        const X1 = W - 26
        const MIN = Math.min(46, (X1 - X0) / segs.length)
        const tot = segs.reduce((s, x) => s + Number(x.length_m), 0)
        let w = segs.map((s) => Math.max(MIN, ((X1 - X0) * Number(s.length_m)) / tot))
        const k = (X1 - X0) / w.reduce((a, b) => a + b, 0)
        w = w.map((v) => v * k)
        const lastPt = segs[segs.length - 1].to_pt
        const rowPts = [...new Set(segs.map((s) => s.from_pt)), lastPt]
        const hasTop = rowPts.some((p) => pins.has(p) || p === front)
        const Y = hasTop ? 92 : 50
        const H = Y + 58
        let x = X0
        const pos = segs.map((s, i) => {
          const o = { s, x, w: w[i] }
          x += w[i]
          return o
        })
        const ticks: [string, number][] = pos.filter((o) => o.s.part === 0).map((o) => [o.s.from_pt, o.x])
        ticks.push([lastPt, X1])
        return (
          <div key={ri}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`Traseu ${rowPts[0]}-${lastPt}`}>
              <defs>
                {cfg.types.map((t) => (
                  <pattern key={t.id} id={`hatch-${ri}-${t.id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="7" height="7" fill={color.paper0} />
                    <rect width="3.5" height="7" fill={t.color} />
                  </pattern>
                ))}
              </defs>
              {pos.map(({ s, x: sx, w: sw }) => {
                const list = stagesFor(cfg, s.kind)
                const applies = view === 'all' || list.includes(view)
                const st: Stare =
                  view === 'all' ? segmentState(cfg, s, mm) : applies && isDone(mm, s.code, view) ? 'done' : 'ns'
                // culoarea = tipul de lucrare; plin = gata, hașurat = în lucru, gol = neînceput
                const tc = typeColor(s.kind)
                const fill = st === 'done' ? tc : st === 'ip' ? `url(#hatch-${ri}-${s.kind})` : color.paper0
                const cx = sx + sw / 2
                const gap = 9
                const dw = list.length * gap
                return (
                  <g
                    key={s.code}
                    className="cursor-pointer outline-none [&:hover>.hit]:fill-paper-1 [&:focus-visible>.hit]:fill-paper-1"
                    tabIndex={0}
                    role="button"
                    opacity={applies ? 1 : 0.28}
                    aria-label={`${segmentLabel(s)}, ${m1(Number(s.length_m))}, ${STARE_LABEL[segmentState(cfg, s, mm)]}`}
                    onClick={() => onSegment(s as Segment & { id: string })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSegment(s as Segment & { id: string })
                      }
                    }}
                  >
                    <rect className="hit" x={sx + 1} y={Y - 30} width={sw - 2} height={70} rx={10} fill="transparent" />
                    <rect x={sx + 3} y={Y - 8} width={sw - 6} height={16} rx={8} fill={fill} stroke={tc} strokeWidth={2} />
                    {st === 'done' && sw > 26 && (
                      <path d={`M${cx - 5} ${Y} l3.5 3.5 l7 -7`} stroke="#fff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {sw > 34 && (
                      <text x={cx} y={Y - 15} textAnchor="middle" fontSize={12} fontWeight={600} fill={color.ink2} className="tabular-nums">
                        {num(Number(s.length_m), 1)}
                      </text>
                    )}
                    {sw > dw + 8 &&
                      list.map((k2, i) => {
                        const v = isDone(mm, s.code, k2)
                        return (
                          <circle
                            key={k2}
                            cx={cx - dw / 2 + gap / 2 + i * gap}
                            cy={Y + 20}
                            r={3.4}
                            fill={v ? color.infoFill : color.track}
                            stroke={v ? color.infoFill : color.ink4}
                            strokeWidth={k2 === view ? 2 : 1}
                          >
                            <title>{`${stageLabel(cfg, k2)}: ${v ? 'gata' : 'nu e gata'}`}</title>
                          </circle>
                        )
                      })}
                  </g>
                )
              })}
              {pos
                .filter((o) => o.s.part > 0)
                .map((o) => (
                  <line key={`sep-${o.s.code}`} x1={o.x} y1={Y - 12} x2={o.x} y2={Y + 12} stroke={color.ink4} strokeDasharray="2 2" />
                ))}
              {ticks.map(([pt, tx]) => {
                const pin = pins.get(pt)
                const isFront = pt === front
                return (
                  <g key={`t-${pt}`}>
                    <line x1={tx} y1={Y - 13} x2={tx} y2={Y + 13} stroke={isFront ? color.info : color.ink1} strokeWidth={isFront ? 3.5 : 2.5} strokeLinecap="round" />
                    <text x={tx} y={Y + 50} textAnchor="middle" fontSize={14} fontWeight={700} fill={isFront ? color.info : color.ink1}>
                      {pt}
                    </text>
                    {isFront && (
                      <g>
                        <line x1={tx} y1={36} x2={tx} y2={Y - 14} stroke={color.info} strokeWidth={2} />
                        <rect x={Math.min(Math.max(tx - 44, 2), W - 90)} y={10} width={88} height={26} rx={13} fill={color.info} />
                        <text x={Math.min(Math.max(tx, 46), W - 46)} y={27} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">
                          am ajuns aici
                        </text>
                      </g>
                    )}
                    {pin && !isFront && (
                      <g
                        className="cursor-pointer"
                        role="button"
                        tabIndex={0}
                        aria-label={`${pin.name}, ${STARE_LABEL[pin.status]}`}
                        onClick={() => onPoint(pin)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onPoint(pin)
                          }
                        }}
                      >
                        {(() => {
                          const c = STARE_FILL[pin.status]
                          const f = pin.status === 'ns' ? color.paper0 : c
                          const tc = pin.status === 'ns' ? color.ink1 : '#fff'
                          const bw = 84
                          const bx = Math.min(Math.max(tx - bw / 2, 2), W - bw - 2)
                          return (
                            <>
                              <line x1={tx} y1={34} x2={tx} y2={Y - 10} stroke={c} strokeWidth={2} />
                              <rect x={bx} y={8} width={bw} height={26} rx={13} fill={f} stroke={c} strokeWidth={2} />
                              <rect x={bx + 10} y={14} width={13} height={13} rx={3} fill="none" stroke={tc} strokeWidth={2} />
                              <text x={bx + 30} y={26} fontSize={12} fontWeight={700} fill={tc}>
                                CVGA
                              </text>
                            </>
                          )
                        })()}
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>
            {ri < rows.length - 1 && <div className="my-0.5 h-px bg-line-1" />}
          </div>
        )
      })}
    </div>
  )
}

// ── „Am ajuns la…" ──────────────────────────────────────────────────────

function CheckpointModal({
  data,
  mm,
  stage: initialStage,
  onClose,
  onSaved,
}: {
  data: TrackerData
  mm: Marks
  stage: string
  onClose: () => void
  onSaved: (d: TrackerData) => void
}) {
  const cfg = data.tracker.config
  const pts = boundaries(data.segments)
  const [stage, setStage] = useState(initialStage)
  const [from, setFrom] = useState(() => defaultFrom(data.segments, data.checkpoints, initialStage))
  const [at, setAt] = useState('')
  const [date, setDate] = useState(azi())
  const [busy, setBusy] = useState(false)

  const plan = at && from && at !== from ? checkpointPlan(cfg, data.segments, mm, stage, from, at) : []
  const meters = plan.reduce((s, x) => s + Number(x.length_m), 0)

  async function save() {
    if (!at || at === from) return toast('Alege VJ-ul la care ați ajuns.')
    setBusy(true)
    try {
      const r = await saveCheckpoint(
        data.tracker.id,
        { stage, from_pt: from, at_pt: at, done_on: date },
        plan.map((s) => s.code)
      )
      onSaved({ ...data, marks: [...data.marks, ...r.marks], checkpoints: [...data.checkpoints, r.checkpoint] })
      toast(`${stageLabel(cfg, stage)}: am ajuns la ${at}`, 'success')
      onClose()
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const label = 'mb-1 block text-sub font-medium text-ink-3'
  return (
    <Modal title="Am ajuns la…" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={label}>Lucrarea</label>
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value)
              setFrom(defaultFrom(data.segments, data.checkpoints, e.target.value))
            }}
            className={inputCls}
          >
            {cfg.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Venind de la</label>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls}>
            {pts.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Am ajuns la</label>
          <select value={at} onChange={(e) => setAt(e.target.value)} className={inputCls}>
            <option value="">alege VJ</option>
            {pts.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={label}>Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
      </div>
      <p className="mt-4 rounded-[10px] bg-paper-1 px-3 py-2.5 text-row text-ink-2">
        {!at || at === from
          ? 'Alege VJ-ul la care ați ajuns.'
          : plan.length
            ? `Se bifează gata ${plan.length} ${plan.length === 1 ? 'porțiune' : 'porțiuni'}, ${m1(meters)}: ${plan.map((s) => segmentLabel(s)).join(', ')}.`
            : `Între ${from} și ${at} totul e deja bifat pentru ${stageLabel(cfg, stage).toLowerCase()}. Se salvează doar punctul.`}
      </p>
      <div className="mt-4 flex gap-2">
        <PrimaryButton onClick={() => void save()} disabled={busy || !at || at === from}>
          Salvează
        </PrimaryButton>
        <GhostButton onClick={onClose}>Renunță</GhostButton>
      </div>
    </Modal>
  )
}

// ── Panourile (porțiune, lucrare separată) ───────────────────────────────

function SegmentPanel({
  data,
  mm,
  seg,
  onClose,
  onChanged,
}: {
  data: TrackerData
  mm: Marks
  seg: Segment & { id: string }
  onClose: () => void
  onChanged: (d: TrackerData) => void
}) {
  const cfg = data.tracker.config
  const list = stagesFor(cfg, seg.kind)
  const type = cfg.types.find((t) => t.id === seg.kind)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(stage: string) {
    const on = !isDone(mm, seg.code, stage)
    const m = { segment_code: seg.code, stage, done_on: azi() }
    setBusy(stage)
    try {
      await setMark(data.tracker.id, m, on)
      const rest = data.marks.filter((x) => !(x.segment_code === seg.code && x.stage === stage))
      onChanged({ ...data, marks: on ? [...rest, m] : rest })
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title={segmentLabel(seg)} onClose={onClose}>
      <p className="-mt-2 mb-4 text-row text-ink-3">
        {m1(Number(seg.length_m))} · {type?.label ?? seg.kind}
        {seg.note ? ` · ${seg.note}` : ''}
      </p>
      <ul className="divide-y divide-line-1">
        {list.map((k) => {
          const d = mm.get(seg.code)?.get(k)
          return (
            <li key={k} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-row font-semibold text-ink-1">{stageLabel(cfg, k)}</p>
                {d && <p className="text-sub text-ink-4">gata din {dataRo(d)}</p>}
              </div>
              <button
                onClick={() => void toggle(k)}
                disabled={busy === k}
                aria-pressed={!!d}
                className={`rounded-full px-3.5 py-1.5 text-sub font-semibold transition-colors duration-[120ms] ease-std ${
                  d ? 'bg-info-fill text-paper-0' : 'bg-segment text-ink-2 hover:text-ink-1'
                }`}
              >
                {d ? '✓ Gata' : 'Bifează gata'}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-sub text-ink-3">
        Folosește bifele doar pentru corecturi. De obicei se bifează cu „Am ajuns la…".
      </p>
    </Modal>
  )
}

function PointPanel({
  point,
  onClose,
  onSaved,
}: {
  point: PointRow
  onClose: () => void
  onSaved: (p: PointRow) => void
}) {
  const [status, setStatus] = useState<Stare>(point.status)
  const [note, setNote] = useState(point.note ?? '')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      onSaved(await updatePoint(point.id, { status, note: note.trim() || null }))
      toast('Salvat', 'success')
      onClose()
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title={point.name} onClose={onClose}>
      <p className="-mt-2 mb-4 text-row text-ink-3">{point.location}</p>
      <SegmentedControl
        value={status}
        onChange={setStatus}
        options={(['ns', 'ip', 'done'] as Stare[]).map((s) => ({ value: s, label: STARE_LABEL[s] }))}
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="ex. Radier turnat, urmează armarea"
        className="mt-4 min-h-[110px] w-full rounded-btn border border-line-2 bg-paper-0 p-3 text-row text-ink-1 focus:border-accent"
        aria-label="Notă"
      />
      <p className="mt-1 text-sub text-ink-3">
        Ultima modificare:{' '}
        {new Date(point.updated_at).toLocaleString('ro-RO', {
          timeZone: 'Europe/Bucharest',
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </p>
      <div className="mt-4 flex gap-2">
        <PrimaryButton onClick={() => void save()} disabled={busy}>
          Salvează
        </PrimaryButton>
        <GhostButton onClick={onClose}>Renunță</GhostButton>
      </div>
    </Modal>
  )
}

// ── Cum stăm azi ─────────────────────────────────────────────────────────

function CumStamAzi({ data, setData }: { data: TrackerData; setData: (d: TrackerData) => void }) {
  const cfg = data.tracker.config
  const mm = useMemo(() => markMap(data.marks), [data.marks])
  const sum = summarize(cfg, data.segments, mm)
  const progress = workProgress(cfg, data.segments, mm, data.checkpoints)
  const [view, setView] = useState('all')
  const [seg, setSeg] = useState<(Segment & { id: string }) | null>(null)
  const [point, setPoint] = useState<PointRow | null>(null)
  const [cpStage, setCpStage] = useState<string | null>(null)
  const pctOf = (v: number) => (sum.total > 0 ? Math.round((v / sum.total) * 100) : 0)
  const front = view === 'all' ? null : (progress.find((p) => p.stage.id === view)?.front?.at_pt ?? null)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="!p-4">
          <p className="text-sub font-medium text-ink-3">Total traseu</p>
          <p className="mt-1 text-stat-sm font-bold tabular-nums text-ink-1">{m1(sum.total)}</p>
          <p className="text-sub text-ink-3">{data.segments.length} porțiuni</p>
        </Card>
        {(['done', 'ip', 'ns'] as Stare[]).map((s) => (
          <Card key={s} className="!p-4">
            <p className="flex items-center gap-1.5 text-sub font-medium text-ink-3">
              <span className="h-2 w-2 rounded-full" style={{ background: STARE_FILL[s] }} />
              {STARE_LABEL[s]}
            </p>
            <p className="mt-1 text-stat-sm font-bold tabular-nums text-ink-1">{m1(sum.byState[s])}</p>
            <p className="text-sub tabular-nums text-ink-3">{pctOf(sum.byState[s])}% din traseu</p>
          </Card>
        ))}
      </div>

      <Card
        title="Unde am ajuns"
        subtitle="Se numără doar ce e terminat. Când șeful de șantier spune „cu săpătura am ajuns la VJ47”, apasă „Am ajuns la…”."
      >
        <ul className="divide-y divide-line-1">
          {progress.map((p) => (
            <li key={p.stage.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-[170px_110px_minmax(0,1fr)_150px_auto]">
              <span className="text-row font-semibold text-ink-1">{p.stage.label}</span>
              <span className="text-right text-row text-ink-2 md:text-left">
                {p.front ? (
                  <>
                    la <span className="font-bold text-ink-1">{p.front.at_pt}</span>
                  </>
                ) : (
                  <span className="text-ink-4">fără punct</span>
                )}
              </span>
              <div className="col-span-2 h-2 rounded-full bg-track md:col-span-1">
                <div className="h-full rounded-full bg-info-fill" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
              </div>
              <span className="text-row tabular-nums text-ink-3 md:text-right">
                {num(p.done, 1)} / {m1(p.total)}
                {p.lastDay && <span className="block text-sub text-ink-4">ultima bifă {zz(p.lastDay)}</span>}
              </span>
              <div className="text-right">
                <GhostButton onClick={() => setCpStage(p.stage.id)}>Am ajuns la…</GhostButton>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Traseu"
        subtitle="Culoarea arată tipul de lucrare. Plin = gata, hașurat = în lucru, gol = neînceput. Punctele de sub fiecare porțiune sunt lucrările ei: albastru = gata. Apasă pe o porțiune pentru a vedea ziua sau pentru a corecta o bifă."
      >
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Ce arată traseul">
          {[{ id: 'all', label: 'Stare generală' }, ...cfg.stages].map((g) => (
            <button
              key={g.id}
              onClick={() => setView(g.id)}
              aria-pressed={view === g.id}
              className={`rounded-full px-3 py-1.5 text-sub font-semibold transition-colors duration-[120ms] ease-std ${
                view === g.id ? 'bg-ink-1 text-paper-0' : 'bg-segment text-ink-2 hover:text-ink-1'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sub text-ink-3">
          {cfg.types.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-5 rounded" style={{ background: t.color }} />
              {t.short}
              {sum.byType[t.id] ? ` ${m1(sum.byType[t.id])}` : ''}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-5 rounded border-2 border-ink-3" />
            neînceput
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-5 rounded"
              style={{ background: `repeating-linear-gradient(45deg, ${color.ink3} 0 3px, transparent 3px 6px)` }}
            />
            în lucru
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-5 rounded bg-ink-3" />
            finalizat
          </span>
        </div>
        <Traseu data={data} mm={mm} view={view} front={front} onSegment={setSeg} onPoint={setPoint} />
      </Card>

      <section>
        <h3 className="mb-3 text-card font-semibold text-ink-1">Cămine și lucrări separate</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.points.map((p) => (
            <Card key={p.id} className="!p-4" onClick={() => setPoint(p)}>
              <Pill tone={STARE_TONE[p.status]}>{STARE_LABEL[p.status]}</Pill>
              <p className="mt-2 text-row font-semibold text-ink-1">{p.name}</p>
              <p className="text-sub text-ink-3">{p.location}</p>
              {p.note && <p className="mt-1 text-sub text-ink-2">{p.note}</p>}
            </Card>
          ))}
        </div>
      </section>

      {cpStage && (
        <CheckpointModal data={data} mm={mm} stage={cpStage} onClose={() => setCpStage(null)} onSaved={setData} />
      )}
      {seg && <SegmentPanel data={data} mm={mm} seg={seg} onClose={() => setSeg(null)} onChanged={setData} />}
      {point && (
        <PointPanel
          point={point}
          onClose={() => setPoint(null)}
          onSaved={(p) => setData({ ...data, points: data.points.map((x) => (x.id === p.id ? p : x)) })}
        />
      )}
    </div>
  )
}

// ── Fila ─────────────────────────────────────────────────────────────────

export function TrackerProiect({ trackerId }: { trackerId: string }) {
  const { data, error, reload, setData } = useTracker(trackerId)
  const [tab, setTab] = useState<'azi' | 'jurnal'>('azi')
  const [aditionala, setAditionala] = useState(false)

  if (error) return <ErrorStrip message={`Nu am putut încărca trackerul: ${error}`} onRetry={() => void reload()} />
  if (!data) return <Skeleton className="h-64 w-full" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {data.tracker.subtitle && <p className="text-sub font-semibold text-ink-3">{data.tracker.subtitle}</p>}
          <h2 className="text-card font-semibold text-ink-1">{data.tracker.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(data.tracker.config.dailyColumns ?? []).some((c) => c.group === 'aditionale') && (
            <GhostButton onClick={() => setAditionala(true)}>+ Adaugă lucrare adițională</GhostButton>
          )}
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: 'azi', label: 'Cum stăm azi' },
              { value: 'jurnal', label: 'Jurnal zilnic' },
            ]}
          />
        </div>
      </div>
      {aditionala && <LucrareAditionalaModal data={data} onClose={() => setAditionala(false)} onSaved={setData} />}
      {tab === 'azi' ? <CumStamAzi data={data} setData={setData} /> : <JurnalZilnic data={data} setData={setData} />}
    </div>
  )
}
