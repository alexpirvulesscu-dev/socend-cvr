// Jurnalul zilnic: o singură foaie, grupată pe săptămâni.
//  · coloanele sunt grupate pe tip de lucrare: Șanț · Console · Sudură · Lucrări adiționale
//  · un rând pe zi arată totalul zilei; ziua se desface în locuri (de la VJ, până la VJ)
//  · cantitățile se scriu pe loc, direct în celule; se salvează când ieși din celulă
import { Fragment, useState } from 'react'
import {
  boundaries,
  dayTotals,
  groupWeeks,
  lineLabel,
  linesOf,
  sumLines,
  weekStart,
  type DailyColumn,
  type DayLine,
} from '../../domain/tracker'
import { azi, deleteDay, saveDay, type DayRow, type TrackerData } from '../../data/tracker'
import { num, toNum } from '../../lib/format'
import { Card, EmptyState, GhostButton, Modal, PrimaryButton } from '../../components/ui'
import { toast } from '../../components/Toast'

const ZI = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ']
const dow = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
const zz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`
const zl = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
const fmt = (v: number | undefined) => (v ? num(v, Number.isInteger(v) ? 0 : 1) : '')
const newId = () => crypto.randomUUID()

const cellInput =
  'h-9 w-full rounded-[8px] border border-transparent bg-transparent px-2 text-right text-row tabular-nums text-ink-1 hover:border-line-2 focus:border-accent focus:bg-paper-0'
const selectCls =
  'h-9 rounded-[8px] border border-line-2 bg-paper-0 px-1.5 text-sub font-semibold text-ink-1 focus:border-accent'
const inputCls =
  'h-10 w-full rounded-btn border border-line-2 bg-paper-0 px-3 text-row text-ink-1 hover:border-line-3 focus:border-accent'

/** O celulă care se salvează la ieșire, doar dacă s-a schimbat ceva. */
function Cell({
  value,
  onCommit,
  align = 'right',
  placeholder,
  label,
}: {
  value: string
  onCommit: (v: string) => void
  align?: 'right' | 'left'
  placeholder?: string
  label: string
}) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    setV(value)
  }
  return (
    <input
      value={v}
      aria-label={label}
      placeholder={placeholder}
      inputMode={align === 'right' ? 'decimal' : undefined}
      size={align === 'right' ? 5 : 32}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (v !== value) onCommit(v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className={`${cellInput} ${align === 'left' ? '!text-left' : ''}`}
    />
  )
}

function cleanQty(cols: DailyColumn[], q: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of cols) if (q[c.id] && q[c.id] > 0) out[c.id] = q[c.id]
  return out
}

/** Pune ziua salvată în listă, cu cele mai noi zile primele. */
function withDay(data: TrackerData, row: DayRow): TrackerData {
  const rest = data.days.filter((d) => d.work_date !== row.work_date)
  return { ...data, days: [...rest, row].sort((a, b) => (a.work_date < b.work_date ? 1 : -1)) }
}

/** Salvează rândurile unei zile; totalul zilei se recalculează din ele. */
async function saveLines(
  data: TrackerData,
  work_date: string,
  lines: DayLine[],
  note: string | null
): Promise<DayRow> {
  const cols = data.tracker.config.dailyColumns ?? []
  return saveDay(data.tracker.id, { work_date, qty: sumLines(lines, cols), lines, note })
}

// ── „Adaugă lucrare adițională" ──────────────────────────────────────────

export function LucrareAditionalaModal({
  data,
  onClose,
  onSaved,
}: {
  data: TrackerData
  onClose: () => void
  onSaved: (d: TrackerData) => void
}) {
  const cols = (data.tracker.config.dailyColumns ?? []).filter((c) => c.group === 'aditionale')
  const pts = boundaries(data.segments)
  const [date, setDate] = useState(azi())
  const [col, setCol] = useState(cols[0]?.id ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const unit = cols.find((c) => c.id === col)?.unit ?? 'ml'

  async function save() {
    const q = toNum(qty)
    if (!col || q <= 0) return toast('Scrie cantitatea.')
    setBusy(true)
    try {
      const day = data.days.find((d) => d.work_date === date)
      const line: DayLine = { id: newId(), from_pt: from || null, to_pt: to || null, qty: { [col]: q }, note: note.trim() || null }
      const row = await saveLines(data, date, [...(day ? linesOf(day) : []), line], day?.note ?? null)
      onSaved(withDay(data, row))
      toast('Lucrare adițională adăugată în jurnal', 'success')
      onClose()
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const label = 'mb-1 block text-sub font-medium text-ink-3'
  const vj = (value: string, set: (v: string) => void, aria: string) => (
    <select value={value} onChange={(e) => set(e.target.value)} className={inputCls} aria-label={aria}>
      <option value="">fără VJ</option>
      {pts.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
    </select>
  )
  return (
    <Modal title="Adaugă lucrare adițională" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={label}>Lucrarea</label>
          <select value={col} onChange={(e) => setCol(e.target.value)} className={inputCls}>
            {cols.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>De la</label>
          {vj(from, setFrom, 'De la')}
        </div>
        <div>
          <label className={label}>Până la</label>
          {vj(to, setTo, 'Până la')}
        </div>
        <div>
          <label className={label}>Cantitate ({unit})</label>
          <input
            value={qty}
            inputMode="decimal"
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void save()}
            placeholder="ex. 12,5"
            className={inputCls}
          />
        </div>
        <div>
          <label className={label}>Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
        <div className="col-span-2">
          <label className={label}>Observații</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ex. stâncă pe toată lățimea șanțului"
            className={inputCls}
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <PrimaryButton onClick={() => void save()} disabled={busy}>
          Salvează
        </PrimaryButton>
        <GhostButton onClick={onClose}>Renunță</GhostButton>
      </div>
    </Modal>
  )
}

// ── Foaia ────────────────────────────────────────────────────────────────

export function JurnalZilnic({ data, setData }: { data: TrackerData; setData: (d: TrackerData) => void }) {
  const cfg = data.tracker.config
  const cols = cfg.dailyColumns ?? []
  const groups = (cfg.groups ?? []).filter((g) => cols.some((c) => c.group === g.id))
  const pts = boundaries(data.segments)
  const days = data.days
  const totals = dayTotals(days, cols)
  const weeks = groupWeeks(days)

  const [newDate, setNewDate] = useState(azi())
  const [busy, setBusy] = useState(false)
  // săptămânile strânse și zilele desfăcute; implicit e deschisă doar ultima săptămână
  const [weekOpen, setWeekOpen] = useState<Record<string, boolean>>({})
  const [dayOpen, setDayOpen] = useState<Record<string, boolean>>({})
  const isWeekOpen = (start: string, i: number) => weekOpen[start] ?? i === 0

  async function persist(day: DayRow, lines: DayLine[], note: string | null = day.note) {
    try {
      setData(withDay(data, await saveLines(data, day.work_date, lines, note)))
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    }
  }

  function patchLine(day: DayRow, id: string, patch: Partial<DayLine>) {
    // la prima modificare, rândul vechi (fără loc) primește un id al lui
    const lines = linesOf(day).map((l) => (l.id === id ? { ...l, ...patch, id: l.id === 'vechi' ? newId() : l.id } : l))
    return persist(day, lines)
  }

  function setQty(day: DayRow, line: DayLine, col: string, value: string) {
    return patchLine(day, line.id, { qty: cleanQty(cols, { ...line.qty, [col]: toNum(value) }) })
  }

  function addLine(day: DayRow) {
    return persist(day, [...linesOf(day), { id: newId(), from_pt: null, to_pt: null, qty: {}, note: null }])
  }

  function removeLine(day: DayRow, line: DayLine) {
    if (Object.keys(line.qty).length && !window.confirm(`Ștergi rândul „${lineLabel(line)}” din ${zz(day.work_date)}?`)) return
    return persist(
      day,
      linesOf(day).filter((l) => l.id !== line.id)
    )
  }

  async function addDay() {
    const open = () => {
      setWeekOpen((w) => ({ ...w, [weekStart(newDate)]: true }))
      setDayOpen((d) => ({ ...d, [newDate]: true }))
    }
    const existing = days.find((d) => d.work_date === newDate)
    if (existing) {
      open()
      return toast(`Ziua ${zz(newDate)} există deja. Am deschis-o.`)
    }
    setBusy(true)
    try {
      const line: DayLine = { id: newId(), from_pt: null, to_pt: null, qty: {}, note: null }
      setData(withDay(data, await saveLines(data, newDate, [line], null)))
      open()
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  async function removeDay(day: DayRow) {
    if (!window.confirm(`Ștergi ziua ${zz(day.work_date)} din jurnal?`)) return
    try {
      await deleteDay(day.id)
      setData({ ...data, days: data.days.filter((d) => d.id !== day.id) })
    } catch (e) {
      toast(`Nu s-a șters: ${e instanceof Error ? e.message : e}`)
    }
  }

  const th = 'border-b border-line-2 px-2 py-2 text-meta font-semibold uppercase tracking-[0.04em] text-ink-3'
  const td = 'border-b border-line-1 px-1 py-1'
  const sticky = 'sticky left-0 z-[1]'
  // linia subțire care desparte grupurile de coloane
  const edge = (i: number) => (i > 0 && cols[i].group !== cols[i - 1].group ? 'border-l border-l-line-2' : '')
  const numTd = `${td} px-3 text-right text-row tabular-nums`
  const caret = (open: boolean) => (
    <span aria-hidden className={`inline-block w-4 text-ink-3 transition-transform duration-[120ms] ${open ? 'rotate-90' : ''}`}>
      ›
    </span>
  )

  return (
    <Card
      title="Jurnal zilnic"
      subtitle="Zilele sunt grupate pe săptămâni. Apasă pe o zi pentru a vedea locurile (de la VJ, până la VJ) și scrie cantitățile direct în celule."
      className="!px-0"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 px-5">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          aria-label="Data zilei noi"
          className="h-10 rounded-btn border border-line-2 bg-paper-0 px-3 text-row text-ink-1 focus:border-accent"
        />
        <PrimaryButton onClick={() => void addDay()} disabled={busy}>
          Adaugă zi
        </PrimaryButton>
      </div>

      <div className="overflow-x-auto">
        <table className="w-max border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={`${th} ${sticky} border-b-0 bg-paper-0`} />
              {groups.map((g) => (
                <th
                  key={g.id}
                  colSpan={cols.filter((c) => c.group === g.id).length}
                  className="border-b border-l border-line-2 px-2 pt-1 pb-1.5 text-center text-sub font-semibold text-ink-1 first:border-l-0"
                >
                  {g.label}
                </th>
              ))}
              <th className="border-b-0" colSpan={2} />
            </tr>
            <tr>
              <th className={`${th} ${sticky} bg-paper-0 pl-5 text-left`}>Data · Loc</th>
              {cols.map((c, i) => (
                <th key={c.id} className={`${th} ${edge(i)} w-[84px] text-right`}>
                  <span className="ml-auto block max-w-[84px] whitespace-normal">{c.label}</span>
                  <span className="block normal-case tracking-normal text-ink-4">{c.unit}</span>
                </th>
              ))}
              <th className={`${th} min-w-[260px] text-left`}>Observații</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {/* totalul general */}
            <tr>
              <td className={`${td} ${sticky} bg-paper-0 py-2.5 pl-5 text-row font-bold text-ink-1`}>Total</td>
              {cols.map((c, i) => (
                <td key={c.id} className={`${numTd} ${edge(i)} font-bold text-ink-1`}>
                  {fmt(totals[c.id]) || '0'}
                </td>
              ))}
              <td className={`${td} px-3 text-sub text-ink-3`}>
                {days.length} {days.length === 1 ? 'zi' : 'zile'} în jurnal
              </td>
              <td className={td} />
            </tr>

            {weeks.map((w, wi) => {
              const open = isWeekOpen(w.start, wi)
              const wt = dayTotals(w.days, cols)
              return (
                <Fragment key={w.start}>
                  {/* săptămâna: se strânge și se deschide */}
                  <tr
                    className="cursor-pointer bg-paper-1"
                    onClick={() => setWeekOpen({ ...weekOpen, [w.start]: !open })}
                  >
                    <td className={`${td} ${sticky} whitespace-nowrap bg-paper-1 py-2 pl-3 pr-3`}>
                      <button aria-expanded={open} className="flex items-center text-row font-semibold text-ink-1">
                        {caret(open)} Săpt. {zl(w.start)} - {zl(w.end)}
                      </button>
                    </td>
                    {cols.map((c, i) => (
                      <td key={c.id} className={`${numTd} ${edge(i)} font-semibold text-ink-2`}>
                        {fmt(wt[c.id])}
                      </td>
                    ))}
                    <td className={`${td} px-3 text-sub text-ink-3`}>
                      {w.days.length} {w.days.length === 1 ? 'zi' : 'zile'}
                    </td>
                    <td className={td} />
                  </tr>

                  {open &&
                    w.days.map((d) => {
                      const lines = linesOf(d)
                      const dOpen = dayOpen[d.work_date] ?? false
                      return (
                        <Fragment key={d.id}>
                          {/* ziua: totalul rândurilor ei */}
                          <tr className="hover:bg-paper-1">
                            <td className={`${td} ${sticky} whitespace-nowrap bg-paper-0 py-2 pl-5 pr-3`}>
                              <button
                                aria-expanded={dOpen}
                                onClick={() => setDayOpen({ ...dayOpen, [d.work_date]: !dOpen })}
                                className="flex items-center text-row font-semibold text-ink-1"
                              >
                                {caret(dOpen)}
                                <span className="inline-block w-6 text-left text-ink-3">{ZI[dow(d.work_date)]}</span>
                                {zz(d.work_date)}
                                <span className="ml-2 text-sub font-medium text-ink-4">
                                  {lines.length} {lines.length === 1 ? 'loc' : 'locuri'}
                                </span>
                              </button>
                            </td>
                            {cols.map((c, i) => (
                              <td key={c.id} className={`${numTd} ${edge(i)} text-ink-1`}>
                                {fmt(d.qty[c.id])}
                              </td>
                            ))}
                            <td className={`${td} max-w-[420px]`}>
                              <Cell
                                value={d.note ?? ''}
                                align="left"
                                label={`Observații, ${zz(d.work_date)}`}
                                onCommit={(v) => void persist(d, linesOf(d), v.trim() || null)}
                              />
                            </td>
                            <td className={`${td} pr-4 text-right`}>
                              <button
                                onClick={() => void removeDay(d)}
                                aria-label={`Șterge ziua ${zz(d.work_date)}`}
                                className="rounded-btn px-2 py-1 text-sub font-semibold text-ink-4 hover:text-neg"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>

                          {/* locurile zilei */}
                          {dOpen &&
                            lines.map((l) => (
                              <tr key={l.id} className="bg-accent-soft/40">
                                <td className={`${td} ${sticky} whitespace-nowrap bg-paper-1 py-1 pl-10 pr-3`}>
                                  <span className="flex items-center gap-1">
                                    {(['from_pt', 'to_pt'] as const).map((k) => (
                                      <select
                                        key={k}
                                        value={l[k] ?? ''}
                                        aria-label={k === 'from_pt' ? 'De la' : 'Până la'}
                                        onChange={(e) => void patchLine(d, l.id, { [k]: e.target.value || null })}
                                        className={selectCls}
                                      >
                                        <option value="">{k === 'from_pt' ? 'de la' : 'până la'}</option>
                                        {pts.map((p) => (
                                          <option key={p} value={p}>
                                            {p}
                                          </option>
                                        ))}
                                      </select>
                                    ))}
                                  </span>
                                </td>
                                {cols.map((c, i) => (
                                  <td key={c.id} className={`${td} ${edge(i)}`}>
                                    <Cell
                                      value={fmt(l.qty[c.id])}
                                      label={`${c.label}, ${lineLabel(l)}, ${zz(d.work_date)}`}
                                      onCommit={(v) => void setQty(d, l, c.id, v)}
                                    />
                                  </td>
                                ))}
                                <td className={`${td} max-w-[420px]`}>
                                  <Cell
                                    value={l.note ?? ''}
                                    align="left"
                                    placeholder="observații pentru acest loc"
                                    label={`Observații, ${lineLabel(l)}, ${zz(d.work_date)}`}
                                    onCommit={(v) => void patchLine(d, l.id, { note: v.trim() || null })}
                                  />
                                </td>
                                <td className={`${td} pr-4 text-right`}>
                                  <button
                                    onClick={() => void removeLine(d, l)}
                                    aria-label={`Șterge rândul ${lineLabel(l)}`}
                                    className="rounded-btn px-2 py-1 text-sub font-semibold text-ink-4 hover:text-neg"
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          {dOpen && (
                            <tr className="bg-accent-soft/40">
                              <td className={`${td} ${sticky} bg-paper-1 py-1.5 pl-10`}>
                                <button
                                  onClick={() => void addLine(d)}
                                  className="text-sub font-semibold text-accent hover:underline"
                                >
                                  + Adaugă loc
                                </button>
                              </td>
                              <td className={td} colSpan={cols.length + 2} />
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {days.length === 0 && <EmptyState title="Jurnalul e gol">Alege data și apasă „Adaugă zi”.</EmptyState>}
    </Card>
  )
}
