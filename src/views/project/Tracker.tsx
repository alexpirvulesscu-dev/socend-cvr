// Fila „Tracker" a unui proiect: execuția pe traseu (primul: Peștișani VJ36-VJ80).
//  · Cum stăm azi: cât e gata, pe etape, harta traseului și lucrările separate.
//  · Jurnal zilnic: ce s-a construit în fiecare zi, de la ce reper la ce reper.
// Harta se calculează din jurnal; apeși pe o porțiune și vezi în ce zi s-a făcut fiecare metru.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  allocate,
  dayTouches,
  segmentHistory,
  segmentLabel,
  segmentState,
  stageState,
  stagesFor,
  summarize,
  workGrid,
  STARE_LABEL,
  type Allocation,
  type Segment,
  type Stare,
  type TrackerConfig,
} from '../../domain/tracker'
import {
  addEntries,
  azi,
  updatePoint,
  useTracker,
  type EntryRow,
  type PointRow,
  type TrackerData,
} from '../../data/tracker'
import { color } from '../../design/tokens'
import { Jurnal, PePortiuni, PeZile, qtyText } from './TrackerTabele'
import { dataRo, num, toNum } from '../../lib/format'
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

const STARE_FILL: Record<Stare, string> = { done: color.posFill, ip: color.warnFill, ns: color.line3 }
const STARE_TONE: Record<Stare, Tone> = { done: 'pos', ip: 'warn', ns: 'neutral' }

const m1 = (n: number) => `${num(n, 1)} m`

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
  alloc,
  view,
  day,
  onSegment,
  onPoint,
}: {
  data: TrackerData
  alloc: Allocation
  view: string
  day: string
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

  const touched = day ? dayTouches(data.entries, alloc, day) : null
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
        const hasPin = rowPts.some((p) => pins.has(p))
        const Y = hasPin ? 92 : 50
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
                <pattern id="hatch-ip" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="7" height="7" fill={color.paper0} />
                  <rect width="3.5" height="7" fill={color.warnFill} />
                </pattern>
              </defs>
              {pos.map(({ s, x: sx, w: sw }) => {
                const list = stagesFor(cfg, s.kind)
                const applies = view === 'all' || list.includes(view)
                const st: Stare =
                  view === 'all'
                    ? segmentState(cfg, s, alloc)
                    : applies
                      ? stageState(s, alloc.filled.get(s.code)?.get(view) ?? 0)
                      : 'ns'
                const fill = st === 'done' ? color.posFill : st === 'ip' ? 'url(#hatch-ip)' : color.paper0
                const stroke = st === 'ns' ? color.line3 : st === 'ip' ? color.warnFill : color.posFill
                const isDay = touched?.has(s.code) ?? false
                const dim = !applies || (touched !== null && !isDay)
                const cx = sx + sw / 2
                const gap = 9
                const dw = list.length * gap
                return (
                  <g
                    key={s.code}
                    className="cursor-pointer outline-none [&:hover>.hit]:fill-paper-1 [&:focus-visible>.hit]:fill-paper-1"
                    tabIndex={0}
                    role="button"
                    opacity={dim ? 0.28 : 1}
                    aria-label={`${segmentLabel(s)}, ${m1(Number(s.length_m))}, ${STARE_LABEL[segmentState(cfg, s, alloc)]}`}
                    onClick={() => onSegment(s as Segment & { id: string })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onSegment(s as Segment & { id: string })
                      }
                    }}
                  >
                    <rect className="hit" x={sx + 1} y={Y - 30} width={sw - 2} height={70} rx={10} fill="transparent" />
                    {isDay && (
                      <rect x={sx + 1} y={Y - 13} width={sw - 2} height={26} rx={13} fill="none" stroke={color.info} strokeWidth={2} />
                    )}
                    <rect x={sx + 3} y={Y - 8} width={sw - 6} height={16} rx={8} fill={fill} stroke={stroke} strokeWidth={2} />
                    <rect x={sx + 6} y={Y + 11} width={Math.max(sw - 12, 2)} height={3} rx={1.5} fill={typeColor(s.kind)} />
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
                        const v = stageState(s, alloc.filled.get(s.code)?.get(k2) ?? 0)
                        const c = v === 'done' ? color.posFill : v === 'ip' ? color.warnFill : color.track
                        return (
                          <circle
                            key={k2}
                            cx={cx - dw / 2 + gap / 2 + i * gap}
                            cy={Y + 24}
                            r={3.3}
                            fill={c}
                            stroke={v === 'ns' ? color.ink4 : c}
                            strokeWidth={k2 === view ? 2 : 1}
                          >
                            <title>{`${stageLabel(cfg, k2)}: ${STARE_LABEL[v]}`}</title>
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
                return (
                  <g key={`t-${pt}`}>
                    <line x1={tx} y1={Y - 13} x2={tx} y2={Y + 13} stroke={color.ink1} strokeWidth={2.5} strokeLinecap="round" />
                    <text x={tx} y={Y + 50} textAnchor="middle" fontSize={14} fontWeight={700} fill={color.ink1}>
                      {pt}
                    </text>
                    {pin && (
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

// ── Panourile (porțiune, lucrare separată) ───────────────────────────────

function SegmentPanel({
  data,
  alloc,
  seg,
  onClose,
  onAdded,
}: {
  data: TrackerData
  alloc: Allocation
  seg: Segment & { id: string }
  onClose: () => void
  onAdded: (rows: EntryRow[]) => void
}) {
  const cfg = data.tracker.config
  const list = stagesFor(cfg, seg.kind)
  const filled = alloc.filled.get(seg.code)
  const hist = segmentHistory(data.entries, alloc, seg.code)
  const type = cfg.types.find((t) => t.id === seg.kind)
  const [date, setDate] = useState(azi())
  const [stage, setStage] = useState(list.find((k) => (filled?.get(k) ?? 0) < Number(seg.length_m) - 0.05) ?? list[0])
  const left = Math.max(0, Number(seg.length_m) - (filled?.get(stage) ?? 0))
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)

  // partea a doua a unei porțiuni împărțite se umple dinspre capătul ei
  const [fromPt, toPt] = seg.part > 0 ? [seg.to_pt, seg.from_pt] : [seg.from_pt, seg.to_pt]

  async function add(q: number) {
    if (!(q > 0)) {
      toast('Scrie câți metri s-au făcut.')
      return
    }
    setBusy(true)
    try {
      const rows = await addEntries(data.tracker.id, [
        { work_date: date, stage, from_pt: fromPt, to_pt: toPt, qty: q, note: null },
      ])
      onAdded(rows)
      setQty('')
      toast(`Adăugat în jurnal: ${stageLabel(cfg, stage)} ${m1(q)}`, 'success')
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={segmentLabel(seg)} onClose={onClose}>
      <p className="-mt-2 mb-4 text-row text-ink-3">
        {m1(Number(seg.length_m))} · {type?.label ?? seg.kind}
        {seg.note ? ` · ${seg.note}` : ''}
      </p>

      <div className="space-y-2.5">
        {list.map((k) => {
          const f = filled?.get(k) ?? 0
          const st = stageState(seg, f)
          return (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="text-row font-semibold text-ink-1">{stageLabel(cfg, k)}</span>
              <span className="text-row tabular-nums text-ink-3">
                {num(f, 1)} / {m1(Number(seg.length_m))} <Pill tone={STARE_TONE[st]}>{STARE_LABEL[st]}</Pill>
              </span>
              <div className="col-span-2 h-1.5 rounded-full bg-track">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(1, f / Number(seg.length_m)) * 100}%`, background: STARE_FILL[st] }}
                />
              </div>
            </div>
          )
        })}
      </div>

      <h4 className="mt-6 text-row font-semibold text-ink-1">Adaugă în jurnal</h4>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[150px_minmax(0,1fr)_110px]">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} aria-label="Data" />
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={inputCls} aria-label="Etapa">
          {list.map((k) => (
            <option key={k} value={k}>
              {stageLabel(cfg, k)}
            </option>
          ))}
        </select>
        <input
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="metri"
          className={inputCls}
          aria-label="Metri"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <PrimaryButton onClick={() => void add(toNum(qty))} disabled={busy}>
          Adaugă
        </PrimaryButton>
        {left > 0.05 && (
          <GhostButton onClick={() => void add(Math.round(left * 100) / 100)} disabled={busy}>
            Gata pe toată porțiunea · {m1(left)}
          </GhostButton>
        )}
      </div>

      <h4 className="mt-6 text-row font-semibold text-ink-1">Zi cu zi</h4>
      {hist.length === 0 ? (
        <p className="mt-1 text-row text-ink-3">Nimic lucrat aici încă.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line-1">
          {hist.map((h, i) => (
            <li key={i} className="flex justify-between gap-3 py-1.5 text-row">
              <span className="text-ink-2">
                {dataRo(h.date)} · {stageLabel(cfg, h.stage)}
              </span>
              <span className="tabular-nums text-ink-1">{m1(h.qty)}</span>
            </li>
          ))}
        </ul>
      )}
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

function CumStamAzi({
  data,
  alloc,
  setData,
}: {
  data: TrackerData
  alloc: Allocation
  setData: (d: TrackerData) => void
}) {
  const cfg = data.tracker.config
  const sum = summarize(cfg, data.segments, alloc)
  const grid = useMemo(() => workGrid(cfg, data.segments, data.entries, azi()), [cfg, data])
  const [view, setView] = useState('all')
  const [day, setDay] = useState('')
  const [seg, setSeg] = useState<(Segment & { id: string }) | null>(null)
  const [point, setPoint] = useState<PointRow | null>(null)
  const days = [...new Set(data.entries.map((e) => e.work_date))].sort().reverse()
  const pctOf = (v: number) => (sum.total > 0 ? Math.round((v / sum.total) * 100) : 0)

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

      <Card title="Progres pe lucrări" subtitle="Realizat din de executat, pe fiecare lucrare. Sudurile nu au o cantitate de executat.">
        <div className="space-y-3">
          {grid.rows.map((g) => (
            <div key={g.stage.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[160px_minmax(0,1fr)_170px]">
              <span className="text-row text-ink-1">{g.stage.label}</span>
              <div className="col-span-2 row-start-2 h-2 rounded-full bg-track sm:col-span-1 sm:row-start-auto">
                <div className="h-full rounded-full bg-pos-fill" style={{ width: `${Math.min(1, g.pct ?? 0) * 100}%` }} />
              </div>
              <span className="text-right text-row tabular-nums text-ink-3">
                {g.total !== null ? `${qtyText(g.stage, g.done).replace(/ (m|buc)$/, '')} / ${qtyText(g.stage, g.total)}` : qtyText(g.stage, g.done)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Traseu"
        subtitle="Apasă pe o porțiune pentru a vedea ce s-a făcut zi cu zi sau pentru a adăuga în jurnal. Punctele de sub porțiune sunt etapele: verde gata, galben în lucru, gri neînceput."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ce arată traseul">
            {[{ id: 'all', label: 'Stare generală' }, ...sum.byStage].map((g) => (
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
          <select value={day} onChange={(e) => setDay(e.target.value)} className={`${inputCls} !w-auto`} aria-label="Arată o zi">
            <option value="">Toate zilele</option>
            {days.map((d) => (
              <option key={d} value={d}>
                Ce s-a făcut pe {dataRo(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sub text-ink-3">
          {cfg.types.map((t) => (
            <span key={t.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-5 rounded" style={{ background: t.color }} />
              {t.short}
              {sum.byType[t.id] ? ` ${m1(sum.byType[t.id])}` : ''}
            </span>
          ))}
          {day && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-5 rounded-full border-2" style={{ borderColor: color.info }} />
              lucrat pe {dataRo(day)}
            </span>
          )}
        </div>
        <Traseu data={data} alloc={alloc} view={view} day={day} onSegment={setSeg} onPoint={setPoint} />
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

      {seg && (
        <SegmentPanel
          data={data}
          alloc={alloc}
          seg={seg}
          onClose={() => setSeg(null)}
          onAdded={(rows) => setData({ ...data, entries: [...data.entries, ...rows] })}
        />
      )}
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
  const [tab, setTab] = useState<'azi' | 'zile' | 'jurnal' | 'portiuni'>('azi')
  const [seg, setSeg] = useState<(Segment & { id: string }) | null>(null)
  const alloc = useMemo(
    () => (data ? allocate(data.tracker.config, data.segments, data.entries) : null),
    [data]
  )

  if (error) return <ErrorStrip message={`Nu am putut încărca trackerul: ${error}`} onRetry={() => void reload()} />
  if (!data || !alloc) return <Skeleton className="h-64 w-full" />

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {data.tracker.subtitle && <p className="text-sub font-semibold text-ink-3">{data.tracker.subtitle}</p>}
          <h2 className="text-card font-semibold text-ink-1">{data.tracker.name}</h2>
        </div>
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: 'azi', label: 'Cum stăm azi' },
              { value: 'zile', label: 'Pe zile' },
              { value: 'jurnal', label: 'Jurnal' },
              { value: 'portiuni', label: 'Pe porțiuni' },
            ]}
          />
        </div>
      </div>
      {tab === 'azi' && <CumStamAzi data={data} alloc={alloc} setData={setData} />}
      {tab === 'zile' && <PeZile data={data} alloc={alloc} />}
      {tab === 'jurnal' && <Jurnal data={data} alloc={alloc} setData={setData} />}
      {tab === 'portiuni' && <PePortiuni data={data} alloc={alloc} onOpenSegment={setSeg} />}
      {seg && (
        <SegmentPanel
          data={data}
          alloc={alloc}
          seg={seg}
          onClose={() => setSeg(null)}
          onAdded={(rows) => setData({ ...data, entries: [...data.entries, ...rows] })}
        />
      )}
    </div>
  )
}
