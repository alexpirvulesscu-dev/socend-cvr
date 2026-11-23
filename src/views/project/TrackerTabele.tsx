// Cele trei foi din Excelul de șantier, mutate în CVR:
//  · Pe zile      — foaia „Tracker": o lucrare pe rând, o zi pe coloană.
//  · Jurnal       — foaia „Jurnal zilnic": un rând = o zi + un loc, toate lucrările pe coloane.
//  · Pe porțiuni  — foaia „Pe secțiuni": ce s-a făcut pe fiecare VJ-VJ, câte zile, ultima zi.
// În plus față de Excel: apeși pe o zi și vezi exact pe ce porțiuni a ajuns fiecare metru.
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import {
  boundaries,
  isSpatial,
  sectionTable,
  segmentLabel,
  workGrid,
  type Allocation,
  type Segment,
  type TrackerConfig,
  type TrackerStage,
} from '../../domain/tracker'
import { addEntries, azi, deleteEntries, type EntryRow, type NewEntry, type TrackerData } from '../../data/tracker'
import { dataRo, num, toNum } from '../../lib/format'
import { Card, EmptyState, GhostButton, Modal, PrimaryButton } from '../../components/ui'
import { toast } from '../../components/Toast'

const inputCls =
  'h-10 w-full rounded-btn border border-line-2 bg-paper-0 px-3 text-row text-ink-1 hover:border-line-3 focus:border-accent'

const ZI = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ']
const dow = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
const zz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

function unitOf(st: TrackerStage | undefined): string {
  return st?.unit === 'buc' ? 'buc' : 'm'
}

export function qtyText(st: TrackerStage | undefined, q: number): string {
  return st?.unit === 'buc' ? `${num(q, Number.isInteger(q) ? 0 : 1)} buc` : `${num(q, 1)} m`
}

function ziLunga(iso: string): string {
  const s = new Date(iso + 'T00:00:00').toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Rândurile jurnalului: un lot = un rând din Excel ─────────────────────

export interface JournalRow {
  key: string
  date: string
  from: string | null
  to: string | null
  note: string | null
  initial: boolean
  entries: EntryRow[]
  created: string
}

export function journalRows(entries: EntryRow[]): JournalRow[] {
  const m = new Map<string, JournalRow>()
  for (const e of entries) {
    const key = e.batch_id ?? e.id
    const r = m.get(key)
    if (r) r.entries.push(e)
    else
      m.set(key, {
        key,
        date: e.work_date,
        from: e.from_pt,
        to: e.to_pt,
        note: e.note,
        initial: e.is_initial,
        entries: [e],
        created: e.created_at,
      })
  }
  return [...m.values()].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.created < b.created ? 1 : -1
  )
}

function placeText(r: { from: string | null; to: string | null }): string {
  if (r.from && r.to) return `${r.from} → ${r.to}`
  return r.from ?? 'fără VJ'
}

/** Sub un rând: unde au ajuns metrii pe hartă (sau de ce nu au ajuns). */
function Allocari({
  data,
  alloc,
  entries,
}: {
  data: TrackerData
  alloc: Allocation
  entries: EntryRow[]
}) {
  const cfg = data.tracker.config
  const idx = useMemo(() => new Map(data.entries.map((e, i) => [e.id, i])), [data.entries])
  const seg = useMemo(() => new Map(data.segments.map((s) => [s.code, s])), [data.segments])
  const lines: { text: string; warn?: boolean }[] = []
  for (const e of entries) {
    if (!e.stage || !e.qty || !isSpatial(cfg, e.stage)) continue
    const st = cfg.stages.find((s) => s.id === e.stage)
    if (!e.from_pt || !e.to_pt) {
      if (!e.is_initial) lines.push({ text: `${st?.label}: fără VJ, nu apare pe hartă` })
      continue
    }
    const i = idx.get(e.id)
    if (i === undefined) continue
    const parts = alloc.allocs.filter((a) => a.entryIndex === i)
    const lost = alloc.unplaced.get(i) ?? 0
    if (parts.length)
      lines.push({
        text: `${st?.label}: ${parts.map((a) => `${segmentLabel(seg.get(a.segCode)!)} ${num(a.qty, 1)}`).join(' · ')}`,
      })
    if (lost > 0.05)
      lines.push({
        text: `${st?.label}: ${num(lost, 1)} m nu încap între ${e.from_pt} și ${e.to_pt} (deja făcuți sau lucrarea nu există acolo)`,
        warn: true,
      })
  }
  if (!lines.length) return null
  return (
    <div className="mt-1 space-y-0.5">
      {lines.map((l, i) => (
        <p key={i} className={`text-sub ${l.warn ? 'text-warn' : 'text-ink-3'}`}>
          {l.text}
        </p>
      ))}
    </div>
  )
}

/** În jurnal: doar ce trebuie corectat (metri fără VJ, metri care nu încap). */
function Avertismente({ data, alloc, entries }: { data: TrackerData; alloc: Allocation; entries: EntryRow[] }) {
  const cfg = data.tracker.config
  const idx = useMemo(() => new Map(data.entries.map((e, i) => [e.id, i])), [data.entries])
  const ml = entries.filter((e) => e.stage && e.qty && isSpatial(cfg, e.stage) && !e.is_initial)
  const faraVj = ml.some((e) => !e.from_pt || !e.to_pt)
  const lost = ml
    .map((e) => ({ e, q: alloc.unplaced.get(idx.get(e.id) ?? -1) ?? 0 }))
    .filter((x) => x.q > 0.05)
  if (!faraVj && !lost.length) return null
  return (
    <div className="mt-1 space-y-0.5 text-sub">
      {faraVj && <p className="text-ink-3">Fără VJ: metrii intră în total, dar nu apar pe hartă.</p>}
      {lost.map(({ e, q }) => (
        <p key={e.id} className="text-warn">
          {cfg.stages.find((s) => s.id === e.stage)?.label}: {num(q, 1)} m nu încap între {e.from_pt} și {e.to_pt}
        </p>
      ))}
    </div>
  )
}

/** Toate rândurile dintr-o zi (sau doar o lucrare), cu porțiunile atinse. */
function ZiModal({
  data,
  alloc,
  date,
  stage,
  onClose,
}: {
  data: TrackerData
  alloc: Allocation
  date: string
  stage: string | null
  onClose: () => void
}) {
  const cfg = data.tracker.config
  const rows = journalRows(data.entries.filter((e) => e.work_date === date && !e.is_initial))
    .map((r) => ({ ...r, entries: stage ? r.entries.filter((e) => e.stage === stage) : r.entries }))
    .filter((r) => r.entries.length)
  const st = cfg.stages.find((s) => s.id === stage)
  return (
    <Modal title={`${st ? `${st.label} · ` : ''}${ziLunga(date)}`} onClose={onClose}>
      {rows.length === 0 ? (
        <p className="text-row text-ink-3">Nimic în jurnal în ziua asta.</p>
      ) : (
        <ul className="divide-y divide-line-1">
          {rows.map((r) => (
            <li key={r.key} className="py-3">
              <p className="text-row font-semibold text-ink-1">{placeText(r)}</p>
              <p className="mt-0.5 text-row text-ink-2">
                {r.entries
                  .filter((e) => e.stage && e.qty)
                  .map((e) => {
                    const s = cfg.stages.find((x) => x.id === e.stage)
                    return `${s?.label} ${qtyText(s, e.qty!)}`
                  })
                  .join(' · ') || 'doar observații'}
              </p>
              <Allocari data={data} alloc={alloc} entries={r.entries} />
              {r.note && <p className="mt-1 text-sub text-ink-2">„{r.note}"</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

// ── Pe zile ──────────────────────────────────────────────────────────────

export function PeZile({ data, alloc }: { data: TrackerData; alloc: Allocation }) {
  const cfg = data.tracker.config
  const { days, rows } = useMemo(() => workGrid(cfg, data.segments, data.entries, azi()), [cfg, data])
  const [open, setOpen] = useState<{ date: string; stage: string | null } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // ultima zi cu lucru: grila se deschide acolo, nu pe zilele goale de la coadă
  const lastWorked = useMemo(() => {
    let last = ''
    for (const r of rows) for (const d of r.perDay.keys()) if (d > last) last = d
    return last
  }, [rows])
  useEffect(() => {
    const el = scroller.current
    const th = el?.querySelector<HTMLElement>(`[data-day="${lastWorked}"]`)
    if (el && th) el.scrollLeft = Math.max(0, th.offsetLeft + th.offsetWidth - el.clientWidth + 120)
  }, [lastWorked, days.length])

  const groups = cfg.groups?.length ? cfg.groups : [{ id: '', label: '' }]
  const hasInitial = rows.some((r) => r.initial > 0)
  const th = 'whitespace-nowrap px-2.5 py-2 text-left text-meta font-semibold uppercase tracking-[0.05em] text-ink-3'
  const td = 'whitespace-nowrap px-2.5 py-2 text-right text-row tabular-nums'
  const sticky = 'sticky left-0 z-[1] bg-paper-0'
  const weekend = (d: string) => dow(d) === 0 || dow(d) === 6
  const dec = (r: (typeof rows)[number]) => (r.stage.unit === 'buc' ? 0 : 1)

  /** rândurile grupate ca în Excel (Tranșee, Console, Sudură) */
  function grouped(colsAfter: number, render: (r: (typeof rows)[number]) => React.ReactNode) {
    return groups.map((g) => {
      const list = rows.filter((r) => (g.id ? r.stage.group === g.id : true))
      if (!list.length) return null
      return [
        g.label ? (
          <tr key={`g-${g.id}`}>
            <td className={`${sticky} border-t border-line-1 px-5 pt-4 pb-1 text-sub font-semibold text-ink-1`}>{g.label}</td>
            <td colSpan={colsAfter} className="border-t border-line-1" />
          </tr>
        ) : null,
        ...list.map(render),
      ]
    })
  }

  return (
    <div className="space-y-5">
      <Card title="Situația la zi" subtitle="Cât era de executat, cât s-a făcut, cât a rămas și ritmul mediu pe o zi lucrată." className="!px-0">
        <div className="overflow-x-auto">
          <table className="w-max min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${th} ${sticky} min-w-[160px] border-b border-line-2 pl-5`}>Lucrare</th>
                {['UM', 'De executat', 'Realizat la zi', '%', 'Rămas', 'Medie / zi lucrată', 'Zile lucrate', ...(hasInitial ? ['Înainte de jurnal'] : [])].map(
                  (h, i) => (
                    <th key={h} className={`${th} border-b border-line-2 ${i ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {grouped(7 + (hasInitial ? 1 : 0), (r) => (
                <tr key={r.stage.id} className="hover:bg-paper-1">
                  <td className={`${sticky} px-5 py-2 text-row text-ink-1`}>{r.stage.label}</td>
                  <td className="px-2.5 py-2 text-row text-ink-3">{unitOf(r.stage) === 'm' ? 'ml' : 'buc'}</td>
                  <td className={`${td} text-ink-2`}>{r.total !== null ? num(r.total, dec(r)) : '–'}</td>
                  <td className={`${td} font-semibold text-ink-1`}>{num(r.done, dec(r))}</td>
                  <td className={`${td} ${r.pct !== null && r.pct >= 1 ? 'text-pos' : 'text-ink-2'}`}>
                    {r.pct !== null ? `${num(r.pct * 100, 0)}%` : '–'}
                  </td>
                  <td className={`${td} ${r.left !== null && r.left < 0 ? 'text-neg' : 'text-ink-2'}`}>
                    {r.left !== null ? num(r.left, dec(r)) : '–'}
                  </td>
                  <td className={`${td} text-ink-2`}>{r.perDayAvg !== null ? num(r.perDayAvg, 1) : '–'}</td>
                  <td className={`${td} text-ink-2`}>{r.daysWorked || '–'}</td>
                  {hasInitial && <td className={`${td} text-ink-3`}>{r.initial ? num(r.initial, dec(r)) : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Pe zile"
        subtitle="O coloană pe zi. Apasă pe o cifră sau pe o zi pentru a vedea de la ce VJ la ce VJ s-a lucrat."
        className="!px-0"
      >
        <div ref={scroller} className="overflow-x-auto">
          <table className="w-max min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={`${th} ${sticky} min-w-[160px] border-b border-line-2 pl-5`}>Lucrare</th>
                {days.map((d) => (
                  <th
                    key={d}
                    data-day={d}
                    className={`${th} cursor-pointer border-b border-line-2 text-center hover:text-ink-1 ${weekend(d) ? 'bg-paper-1' : ''}`}
                    onClick={() => setOpen({ date: d, stage: null })}
                    title={`Tot ce s-a făcut pe ${dataRo(d)}`}
                  >
                    <span className="block normal-case">{ZI[dow(d)]}</span>
                    <span className="block normal-case tracking-normal">{zz(d)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped(days.length, (r) => (
                <tr key={r.stage.id} className="hover:bg-paper-1">
                  <td className={`${sticky} px-5 py-2 text-row text-ink-1`}>{r.stage.label}</td>
                  {days.map((d) => {
                    const q = r.perDay.get(d)
                    return (
                      <td
                        key={d}
                        className={`${td} min-w-[52px] text-center ${weekend(d) ? 'bg-paper-1' : ''} ${
                          q ? 'cursor-pointer font-semibold text-ink-1 hover:bg-accent-soft' : 'text-ink-4'
                        }`}
                        onClick={q ? () => setOpen({ date: d, stage: r.stage.id }) : undefined}
                      >
                        {q ? num(q, Number.isInteger(q) ? 0 : 1) : '·'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {open && <ZiModal data={data} alloc={alloc} date={open.date} stage={open.stage} onClose={() => setOpen(null)} />}
    </div>
  )
}

// ── Jurnal ───────────────────────────────────────────────────────────────

interface Draft {
  date: string
  from: string
  to: string
  qty: Record<string, string>
  note: string
}

const emptyDraft = (): Draft => ({ date: azi(), from: '', to: '', qty: {}, note: '' })

export function Jurnal({
  data,
  alloc,
  setData,
}: {
  data: TrackerData
  alloc: Allocation
  setData: (d: TrackerData) => void
}) {
  const cfg = data.tracker.config
  const pts = boundaries(data.segments)
  const [d, setD] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<JournalRow | null>(null)
  const [busy, setBusy] = useState(false)
  const rows = useMemo(() => journalRows(data.entries), [data.entries])
  const idxOf = useMemo(() => new Map(data.entries.map((e, i) => [e.id, i])), [data.entries])
  const isVj = (p: string) => pts.includes(p)

  function edit(r: JournalRow) {
    const qty: Record<string, string> = {}
    for (const e of r.entries) if (e.stage && e.qty) qty[e.stage] = num(e.qty, Number.isInteger(e.qty) ? 0 : 1)
    setD({ date: r.date, from: r.from ?? '', to: r.to ?? '', qty, note: r.note ?? '' })
    setEditing(r)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save() {
    const vals = cfg.stages
      .map((s) => ({ s, q: toNum(d.qty[s.id] ?? '') }))
      .filter((x) => x.q > 0)
    const note = d.note.trim() || null
    if (!vals.length && !note) return toast('Scrie cel puțin o cantitate sau o observație.')
    if (isVj(d.from) && !d.to) return toast('Alege și „până la". Fără el, metrii nu pot fi puși pe hartă.')
    if (d.from && d.to && d.from === d.to) return toast('Alege două repere diferite.')
    const from = d.from || null
    const to = d.from && isVj(d.from) ? d.to || null : null
    const batch = crypto.randomUUID()
    const base = { work_date: d.date, from_pt: from, to_pt: to, note, batch_id: batch }
    const news: NewEntry[] = vals.length
      ? vals.map((x) => ({ ...base, stage: x.s.id, qty: x.q }))
      : [{ ...base, stage: null, qty: null }]
    setBusy(true)
    try {
      const added = await addEntries(data.tracker.id, news)
      let keep = data.entries
      if (editing) {
        const ids = editing.entries.map((e) => e.id)
        await deleteEntries(ids)
        keep = keep.filter((e) => !ids.includes(e.id))
      }
      setData({ ...data, entries: [...keep, ...added] })
      setD({ ...emptyDraft(), date: d.date })
      setEditing(null)
      toast(editing ? 'Rând modificat' : 'Adăugat în jurnal', 'success')
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(r: JournalRow) {
    if (!window.confirm(`Ștergi rândul din ${dataRo(r.date)}, ${placeText(r)}?`)) return
    try {
      const ids = r.entries.map((e) => e.id)
      await deleteEntries(ids)
      setData({ ...data, entries: data.entries.filter((e) => !ids.includes(e.id)) })
    } catch (err) {
      toast(`Nu s-a șters: ${err instanceof Error ? err.message : err}`)
    }
  }

  const label = 'mb-1 block text-sub font-medium text-ink-3'
  const groups = cfg.groups?.length ? cfg.groups : [{ id: '', label: 'Cantități' }]

  return (
    <div className="space-y-5">
      <Card
        title={editing ? `Modifici rândul din ${dataRo(editing.date)}` : 'Rând nou în jurnal'}
        subtitle="Un rând = o zi și un loc. Completezi doar ce s-a făcut; restul rămâne gol. Metrii pleacă de la primul VJ spre al doilea."
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[150px_220px_150px]">
          <div className="col-span-2 md:col-span-1">
            <label className={label}>Data</label>
            <input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={label}>De la stâlpul / lucrare</label>
            <select value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} className={inputCls}>
              <option value="">fără VJ</option>
              <optgroup label="Stâlpi">
                {pts.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Lucrări separate">
                {data.points.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label className={label}>Până la stâlpul</label>
            <select
              value={isVj(d.from) ? d.to : ''}
              disabled={!isVj(d.from)}
              onChange={(e) => setD({ ...d, to: e.target.value })}
              className={`${inputCls} disabled:bg-paper-1 disabled:text-ink-4`}
            >
              <option value="">–</option>
              {pts.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {groups.map((g) => {
            const list = cfg.stages.filter((s) => (g.id ? s.group === g.id : true))
            if (!list.length) return null
            return (
              <fieldset key={g.id} className="rounded-[12px] border border-line-1 p-3">
                <legend className="px-1 text-sub font-semibold text-ink-2">{g.label}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {list.map((s) => (
                    <div key={s.id}>
                      <label className={label}>
                        {s.label} <span className="text-ink-4">({s.unit === 'buc' ? 'buc' : 'ml'})</span>
                      </label>
                      <input
                        inputMode="decimal"
                        value={d.qty[s.id] ?? ''}
                        onChange={(e) => setD({ ...d, qty: { ...d.qty, [s.id]: e.target.value } })}
                        className={`${inputCls} text-right tabular-nums`}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>
            )
          })}
        </div>

        <div className="mt-3">
          <label className={label}>Observații</label>
          <input
            value={d.note}
            onChange={(e) => setD({ ...d, note: e.target.value })}
            placeholder="ex. a plouat, s-a lucrat doar dimineața"
            className={inputCls}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <PrimaryButton onClick={() => void save()} disabled={busy}>
            {editing ? 'Salvează modificarea' : 'Adaugă rândul'}
          </PrimaryButton>
          {editing && (
            <GhostButton
              onClick={() => {
                setEditing(null)
                setD(emptyDraft())
              }}
            >
              Renunță
            </GhostButton>
          )}
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="Jurnalul e gol">Adaugă primul rând mai sus.</EmptyState>
        </Card>
      ) : (
        <Card title="Jurnal zilnic" subtitle="Cel mai nou rând primul." className="!px-0">
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  {['Data', 'Unde'].map((h) => (
                    <th key={h} className="whitespace-nowrap border-b border-line-2 px-3 py-2 text-left text-meta font-semibold uppercase tracking-[0.05em] text-ink-3 first:pl-5">
                      {h}
                    </th>
                  ))}
                  {cfg.stages.map((s) => (
                    <th key={s.id} className="border-b border-line-2 px-2 py-2 text-right text-meta font-semibold uppercase tracking-[0.04em] text-ink-3">
                      <span className="ml-auto block max-w-[72px] whitespace-normal">{s.label}</span>
                      <span className="block normal-case tracking-normal text-ink-4">{s.unit === 'buc' ? 'buc' : 'ml'}</span>
                    </th>
                  ))}
                  <th className="border-b border-line-2 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const q = new Map(r.entries.filter((e) => e.stage).map((e) => [e.stage!, e.qty!]))
                  const hasNote =
                    !!r.note ||
                    r.entries.some(
                      (e) =>
                        e.stage &&
                        e.qty &&
                        !e.is_initial &&
                        isSpatial(cfg, e.stage) &&
                        (!e.from_pt || !e.to_pt || (alloc.unplaced.get(idxOf.get(e.id) ?? -1) ?? 0) > 0.05)
                    )
                  const line = 'border-b border-line-1'
                  return (
                    <Fragment key={r.key}>
                      <tr className={`align-top ${editing?.key === r.key ? 'bg-accent-soft' : ''}`}>
                        <td className={`whitespace-nowrap py-2.5 pl-5 pr-3 text-row font-semibold text-ink-1 ${hasNote ? '' : line}`}>
                          {r.initial ? 'Înainte de jurnal' : `${ZI[dow(r.date)]} ${zz(r.date)}`}
                        </td>
                        <td className={`max-w-[170px] px-3 py-2.5 text-row text-ink-1 ${hasNote ? '' : line}`}>{placeText(r)}</td>
                        {cfg.stages.map((s) => (
                          <td key={s.id} className={`px-2 py-2.5 text-right text-row tabular-nums text-ink-1 ${hasNote ? '' : line}`}>
                            {q.get(s.id) ? num(q.get(s.id)!, Number.isInteger(q.get(s.id)!) ? 0 : 1) : ''}
                          </td>
                        ))}
                        <td className={`whitespace-nowrap px-3 py-2.5 text-right ${hasNote ? '' : line}`}>
                          <button onClick={() => edit(r)} className="rounded-btn px-2 py-1 text-sub font-semibold text-ink-3 hover:text-ink-1">
                            Modifică
                          </button>
                          <button onClick={() => void remove(r)} className="rounded-btn px-2 py-1 text-sub font-semibold text-ink-3 hover:text-neg">
                            Șterge
                          </button>
                        </td>
                      </tr>
                      {hasNote && (
                        <tr className={editing?.key === r.key ? 'bg-accent-soft' : ''}>
                          <td className={line} />
                          <td colSpan={cfg.stages.length + 2} className={`${line} px-3 pb-2.5 text-sub text-ink-2`}>
                            {r.note}
                            <Avertismente data={data} alloc={alloc} entries={r.entries} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

// ── Pe porțiuni ──────────────────────────────────────────────────────────

export function PePortiuni({
  data,
  alloc,
  onOpenSegment,
}: {
  data: TrackerData
  alloc: Allocation
  onOpenSegment: (s: Segment & { id: string }) => void
}) {
  const cfg = data.tracker.config
  const table = useMemo(() => sectionTable(cfg, data.segments, data.entries, alloc), [cfg, data, alloc])
  const ml = cfg.stages.filter((s) => isSpatial(cfg, s.id))
  const typeLabel = (k: string) => cfg.types.find((t) => t.id === k)?.short ?? k
  const th = 'whitespace-nowrap border-b border-line-2 px-3 py-2 text-meta font-semibold uppercase tracking-[0.05em] text-ink-3'

  return (
    <Card
      title="Pe porțiuni"
      subtitle="Metri făcuți din metri de executat, pe fiecare porțiune. Verde = gata. Apasă pe o porțiune pentru a vedea ziua fiecărui metru."
      className="!px-0"
    >
      <div className="overflow-x-auto">
        <table className="w-max min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={`${th} sticky left-0 z-[1] bg-paper-0 pl-5 text-left`}>Porțiune</th>
              <th className={`${th} text-left`}>Tip</th>
              <th className={`${th} text-right`}>Lungime</th>
              <th className={`${th} text-right`}>Zile lucrate</th>
              <th className={`${th} text-right`}>Ultima zi</th>
              {ml.map((s) => (
                <th key={s.id} className={`${th} text-right`}>
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr
                key={r.from}
                className="cursor-pointer hover:bg-paper-1"
                onClick={() => onOpenSegment(r.parts[0] as Segment & { id: string })}
              >
                <td className="sticky left-0 z-[1] whitespace-nowrap border-b border-line-1 bg-inherit py-2 pl-5 pr-3 text-row font-semibold text-ink-1">
                  {r.from}-{r.to}
                </td>
                <td className="whitespace-nowrap border-b border-line-1 px-3 py-2 text-row text-ink-2">
                  {[...new Set(r.parts.map((p) => typeLabel(p.kind)))].join(' + ')}
                </td>
                <td className="border-b border-line-1 px-3 py-2 text-right text-row tabular-nums text-ink-2">{num(r.length, 1)}</td>
                <td className="border-b border-line-1 px-3 py-2 text-right text-row tabular-nums text-ink-2">{r.daysWorked || ''}</td>
                <td className="whitespace-nowrap border-b border-line-1 px-3 py-2 text-right text-row text-ink-2">
                  {r.lastDay ? `${ZI[dow(r.lastDay)]} ${zz(r.lastDay)}` : ''}
                </td>
                {ml.map((s) => {
                  const g = r.byStage.get(s.id)
                  if (!g) return <td key={s.id} className="border-b border-line-1 px-3 py-2 text-right text-row text-ink-4">–</td>
                  const full = g.done >= g.total - 0.05
                  return (
                    <td
                      key={s.id}
                      className={`border-b border-line-1 px-3 py-2 text-right text-row tabular-nums ${
                        full ? 'font-semibold text-pos' : g.done > 0.05 ? 'text-warn' : 'text-ink-4'
                      }`}
                    >
                      {g.done > 0.05 ? num(g.done, 1) : '0'}
                    </td>
                  )
                })}

              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export type { TrackerConfig }
