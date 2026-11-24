// Jurnalul zilnic: o singură foaie, grupată pe săptămâni.
//  · coloanele sunt grupate pe tip de lucrare: Șanț · Console · Sudură · Lucrări adiționale
//  · un rând pe zi; scrii direct în celule (se salvează când ieși din celulă)
//    sau apeși pe dată și se deschide panoul lateral, cu aceleași cifre
//  · coloana „Unde" se completează singură din bifele de pe traseu (aceeași zi)
//    și din lucrările adiționale adăugate pe o porțiune
import { Fragment, useState } from 'react'
import {
  dayPlaces,
  dayTotals,
  groupWeeks,
  segmentLabel,
  weekStart,
  type DailyColumn,
  type DayLine,
  type Segment,
} from '../../domain/tracker'
import { azi, deleteDay, saveDay, type DayRow, type TrackerData } from '../../data/tracker'
import { num, toNum } from '../../lib/format'
import { Card, EmptyState, GhostButton, PrimaryButton } from '../../components/ui'
import { toast } from '../../components/Toast'

const ZI = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ']
const ZI_LUNG = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă']
const dow = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
const zz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`
const zl = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
const fmt = (v: number | undefined) => (v ? num(v, Number.isInteger(v) ? 0 : 1) : '')
const round2 = (v: number) => Math.round(v * 100) / 100

const inputCls =
  'h-10 w-full rounded-btn border border-line-2 bg-paper-0 px-3 text-row text-ink-1 hover:border-line-3 focus:border-accent'
const blueBtn =
  'rounded-full bg-info-fill px-3.5 py-1.5 text-sub font-semibold text-paper-0 transition-opacity duration-[120ms] ease-std hover:opacity-90 disabled:opacity-50'
const labelCls = 'mb-1 block text-sub font-medium text-ink-3'

const cellInput =
  'h-9 w-full rounded-[8px] border border-transparent bg-transparent px-2 text-right text-row tabular-nums text-ink-1 hover:border-line-2 focus:border-accent focus:bg-paper-0'

/** O celulă care se salvează la ieșire, doar dacă s-a schimbat ceva. */
function Cell({
  value,
  onCommit,
  align = 'right',
  label,
}: {
  value: string
  onCommit: (v: string) => void
  align?: 'right' | 'left'
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
      inputMode={align === 'right' ? 'decimal' : undefined}
      size={align === 'right' ? 5 : 28}
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

// ── „Adaugă lucrare adițională", pe o porțiune a traseului ───────────────

export function LucrareAditionala({
  data,
  seg,
  onSaved,
}: {
  data: TrackerData
  seg: Segment
  onSaved: (d: TrackerData) => void
}) {
  const cols = (data.tracker.config.dailyColumns ?? []).filter((c) => c.group === 'aditionale')
  const [open, setOpen] = useState(false)
  const [col, setCol] = useState(cols[0]?.id ?? '')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(azi())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (!cols.length) return null

  // ce s-a adăugat deja pe porțiunea asta
  const done = data.days.flatMap((d) =>
    (d.lines ?? [])
      .filter((l) => l.from_pt === seg.from_pt && l.to_pt === seg.to_pt)
      .flatMap((l) =>
        cols.filter((c) => l.qty[c.id] > 0).map((c) => ({ key: `${l.id}-${c.id}`, text: `${c.label}: ${fmt(l.qty[c.id])} ${c.unit}`, day: d.work_date, note: l.note }))
      )
  )

  async function save() {
    const q = toNum(qty)
    if (!col || q <= 0) return toast('Scrie cantitatea.')
    setBusy(true)
    try {
      const day = data.days.find((d) => d.work_date === date)
      const line: DayLine = {
        id: crypto.randomUUID(),
        from_pt: seg.from_pt,
        to_pt: seg.to_pt,
        qty: { [col]: q },
        note: note.trim() || null,
      }
      const row = await saveDay(data.tracker.id, {
        work_date: date,
        qty: { ...(day?.qty ?? {}), [col]: round2(Number(day?.qty[col] ?? 0) + q) },
        lines: [...(day?.lines ?? []), line],
        note: day?.note ?? null,
      })
      onSaved(withDay(data, row))
      toast('Lucrare adițională adăugată. Apare și în jurnalul zilnic.', 'success')
      setQty('')
      setNote('')
      setOpen(false)
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 border-t border-line-1 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-row font-semibold text-ink-1">Lucrări adiționale</p>
        {!open && (
          <button onClick={() => setOpen(true)} className={blueBtn}>
            + Adaugă lucrare adițională
          </button>
        )}
      </div>
      {done.length > 0 && (
        <ul className="mt-2 space-y-1">
          {done.map((x) => (
            <li key={x.key} className="text-sub text-ink-2">
              <span className="font-semibold text-ink-1">{x.text}</span> · {zz(x.day)}
              {x.note ? ` · ${x.note}` : ''}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>Lucrarea</label>
            <select value={col} onChange={(e) => setCol(e.target.value)} className={inputCls}>
              {cols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Cantitate ({cols.find((c) => c.id === col)?.unit ?? 'ml'})</label>
            <input
              value={qty}
              inputMode="decimal"
              autoFocus
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
              placeholder="ex. 12,5"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Observații</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. stâncă pe toată lățimea" className={inputCls} />
          </div>
          <div className="col-span-2 flex gap-2">
            <button onClick={() => void save()} disabled={busy} className={blueBtn}>
              Salvează în {segmentLabel(seg)}
            </button>
            <GhostButton onClick={() => setOpen(false)}>Renunță</GhostButton>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Panoul lateral al unei zile ──────────────────────────────────────────

function DayPanel({
  data,
  day,
  date: initialDate,
  onClose,
  onSaved,
}: {
  data: TrackerData
  /** ziua deschisă; lipsește când se adaugă o zi nouă */
  day: DayRow | null
  date: string
  onClose: () => void
  onSaved: (d: TrackerData) => void
}) {
  const cfg = data.tracker.config
  const cols = cfg.dailyColumns ?? []
  const groups = (cfg.groups ?? []).filter((g) => cols.some((c) => c.group === g.id))
  const [date, setDate] = useState(initialDate)
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(cols.map((c) => [c.id, fmt(day?.qty[c.id])]))
  )
  const [note, setNote] = useState(day?.note ?? '')
  const [busy, setBusy] = useState(false)
  const places = day ? dayPlaces(cfg, data.segments, data.marks, day) : []

  async function save() {
    if (!day && data.days.some((d) => d.work_date === date)) return toast(`Ziua ${zz(date)} există deja în jurnal.`)
    const q: Record<string, number> = {}
    for (const c of cols) q[c.id] = toNum(qty[c.id] ?? '')
    setBusy(true)
    try {
      const row = await saveDay(data.tracker.id, {
        work_date: date,
        qty: cleanQty(cols, q),
        lines: day?.lines ?? [],
        note: note.trim() || null,
      })
      onSaved(withDay(data, row))
      toast('Salvat', 'success')
      onClose()
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!day || !window.confirm(`Ștergi ziua ${zz(day.work_date)} din jurnal?`)) return
    try {
      await deleteDay(day.id)
      onSaved({ ...data, days: data.days.filter((d) => d.id !== day.id) })
      onClose()
    } catch (e) {
      toast(`Nu s-a șters: ${e instanceof Error ? e.message : e}`)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-scrim" onClick={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-paper-0 shadow-e2"
        onClick={(e) => e.stopPropagation()}
        aria-label="Ziua din jurnal"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line-1 p-5">
          <div>
            <p className="text-sub font-medium text-ink-3">{day ? ZI_LUNG[dow(date)] : 'Zi nouă'}</p>
            <h3 className="text-card font-semibold text-ink-1">{day ? zz(date) : 'Adaugă zi'}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-segment text-ink-3 hover:text-ink-1"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {!day && (
            <div>
              <label className={labelCls}>Data</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
          )}
          {groups.map((g) => (
            <section key={g.id}>
              <p className="mb-2 text-row font-semibold text-ink-1">{g.label}</p>
              <div className="grid grid-cols-2 gap-3">
                {cols
                  .filter((c) => c.group === g.id)
                  .map((c) => (
                    <div key={c.id}>
                      <label className={labelCls}>
                        {c.label} ({c.unit})
                      </label>
                      <input
                        value={qty[c.id] ?? ''}
                        inputMode="decimal"
                        aria-label={c.label}
                        onChange={(e) => setQty({ ...qty, [c.id]: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && void save()}
                        className={`${inputCls} text-right tabular-nums`}
                      />
                    </div>
                  ))}
              </div>
            </section>
          ))}
          <div>
            <label className={labelCls}>Observații</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex. a plouat, s-a lucrat doar dimineața"
              className="min-h-[90px] w-full rounded-btn border border-line-2 bg-paper-0 p-3 text-row text-ink-1 focus:border-accent"
            />
          </div>
          {day && (
            <div>
              <p className="mb-1 text-row font-semibold text-ink-1">Unde</p>
              {places.length ? (
                <ul className="space-y-1">
                  {places.map((p) => (
                    <li key={p.label} className="text-row text-ink-2">
                      <span className="font-semibold text-ink-1">{p.label}:</span> {p.where}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sub text-ink-3">
                  Se completează singur când o porțiune e bifată gata în aceeași zi, în „Cum stăm azi”.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line-1 p-5">
          <PrimaryButton onClick={() => void save()} disabled={busy}>
            Salvează
          </PrimaryButton>
          <GhostButton onClick={onClose}>Renunță</GhostButton>
          {day && (
            <button onClick={() => void remove()} className="ml-auto text-sub font-semibold text-ink-4 hover:text-neg">
              Șterge ziua
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}

// ── Foaia ────────────────────────────────────────────────────────────────

export function JurnalZilnic({ data, setData }: { data: TrackerData; setData: (d: TrackerData) => void }) {
  const cfg = data.tracker.config
  const cols = cfg.dailyColumns ?? []
  const groups = (cfg.groups ?? []).filter((g) => cols.some((c) => c.group === g.id))
  const days = data.days
  const totals = dayTotals(days, cols)
  const weeks = groupWeeks(days)

  const [newDate, setNewDate] = useState(azi())
  // săptămânile strânse; implicit e deschisă doar ultima
  const [weekOpen, setWeekOpen] = useState<Record<string, boolean>>({})
  // panoul lateral: o zi existentă sau o zi nouă
  const [panel, setPanel] = useState<{ date: string } | null>(null)
  const isWeekOpen = (start: string, i: number) => weekOpen[start] ?? i === 0

  /** Scris direct în tabel: o cantitate sau observațiile zilei. */
  async function commit(day: DayRow, patch: { col?: string; value?: string; note?: string }) {
    const qty = { ...day.qty }
    if (patch.col) qty[patch.col] = toNum(patch.value ?? '')
    const note = patch.note !== undefined ? patch.note.trim() || null : day.note
    try {
      const row = await saveDay(data.tracker.id, {
        work_date: day.work_date,
        qty: cleanQty(cols, qty),
        lines: day.lines ?? [],
        note,
      })
      setData(withDay(data, row))
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    }
  }

  function openDay(date: string) {
    setWeekOpen((w) => ({ ...w, [weekStart(date)]: true }))
    setPanel({ date })
  }

  const th = 'border-b border-line-2 px-2 py-2 text-meta font-semibold uppercase tracking-[0.04em] text-ink-3'
  const td = 'border-b border-line-1 px-1 py-1'
  const sticky = 'sticky left-0 z-[1]'
  // linia subțire care desparte grupurile de coloane
  const edge = (i: number) => (i === 0 || cols[i].group !== cols[i - 1].group ? 'border-l border-l-line-2' : '')
  const numTd = `${td} px-3 text-right text-row tabular-nums`

  return (
    <Card
      title="Jurnal zilnic"
      subtitle="Un rând pe zi, grupat pe săptămâni. Scrie direct în celule sau apasă pe dată pentru a deschide ziua în panoul lateral. Coloana „Unde” se completează singură din bifele de pe traseu."
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
        <PrimaryButton onClick={() => openDay(newDate)}>Adaugă zi</PrimaryButton>
      </div>

      <div className="overflow-x-auto">
        <table className="w-max border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={`${th} ${sticky} bg-paper-0`} />
              {groups.map((g) => (
                <th
                  key={g.id}
                  colSpan={cols.filter((c) => c.group === g.id).length}
                  className="border-b border-l border-line-2 px-2 pt-1 pb-1.5 text-center text-sub font-semibold text-ink-1"
                >
                  {g.label}
                </th>
              ))}
              <th className="border-b border-l border-line-2" />
              <th className="border-b border-l border-line-2" />
            </tr>
            <tr>
              <th className={`${th} ${sticky} bg-paper-0 pl-5 text-left`}>Data</th>
              {cols.map((c, i) => (
                <th key={c.id} className={`${th} ${edge(i)} w-[84px] text-right`}>
                  <span className="ml-auto block max-w-[84px] whitespace-normal">{c.label}</span>
                  <span className="block normal-case tracking-normal text-ink-4">{c.unit}</span>
                </th>
              ))}
              <th className={`${th} min-w-[220px] border-l border-l-line-2 pl-3 text-left`}>Observații</th>
              <th className={`${th} min-w-[220px] border-l border-l-line-2 pl-3 text-left`}>Unde</th>
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
              <td className={`${td} border-l border-l-line-2 px-3 text-sub text-ink-3`}>
                {days.length} {days.length === 1 ? 'zi' : 'zile'} în jurnal
              </td>
              <td className={`${td} border-l border-l-line-2`} />
            </tr>

            {weeks.map((w, wi) => {
              const open = isWeekOpen(w.start, wi)
              const wt = dayTotals(w.days, cols)
              return (
                <Fragment key={w.start}>
                  {/* săptămâna: se strânge și se deschide */}
                  <tr className="cursor-pointer bg-paper-1" onClick={() => setWeekOpen({ ...weekOpen, [w.start]: !open })}>
                    <td className={`${td} ${sticky} whitespace-nowrap bg-paper-1 py-2 pl-3 pr-3`}>
                      <button aria-expanded={open} className="flex items-center text-row font-semibold text-ink-1">
                        <span
                          aria-hidden
                          className={`inline-block w-4 text-ink-3 transition-transform duration-[120ms] ${open ? 'rotate-90' : ''}`}
                        >
                          ›
                        </span>
                        Săpt. {zl(w.start)} - {zl(w.end)}
                      </button>
                    </td>
                    {cols.map((c, i) => (
                      <td key={c.id} className={`${numTd} ${edge(i)} font-semibold text-ink-2`}>
                        {fmt(wt[c.id])}
                      </td>
                    ))}
                    <td className={`${td} border-l border-l-line-2 px-3 text-sub text-ink-3`}>
                      {w.days.length} {w.days.length === 1 ? 'zi' : 'zile'}
                    </td>
                    <td className={`${td} border-l border-l-line-2`} />
                  </tr>

                  {open &&
                    w.days.map((d) => {
                      const places = dayPlaces(cfg, data.segments, data.marks, d)
                      return (
                        <tr key={d.id} className="group hover:bg-paper-1">
                          <td className={`${td} ${sticky} whitespace-nowrap bg-paper-0 py-1.5 pl-8 pr-3 group-hover:bg-paper-1`}>
                            <button
                              onClick={() => openDay(d.work_date)}
                              aria-label={`Deschide ziua ${zz(d.work_date)}`}
                              title="Deschide ziua în panoul lateral"
                              className="rounded-[8px] px-1.5 py-1 text-row font-semibold text-ink-1 hover:bg-segment"
                            >
                              <span className="inline-block w-6 text-left text-ink-3">{ZI[dow(d.work_date)]}</span> {zz(d.work_date)}
                              <span aria-hidden className="ml-1.5 text-ink-4">›</span>
                            </button>
                          </td>
                          {cols.map((c, i) => (
                            <td key={c.id} className={`${td} ${edge(i)}`}>
                              <Cell
                                value={fmt(d.qty[c.id])}
                                label={`${c.label}, ${zz(d.work_date)}`}
                                onCommit={(v) => void commit(d, { col: c.id, value: v })}
                              />
                            </td>
                          ))}
                          <td className={`${td} max-w-[320px] border-l border-l-line-2`}>
                            <Cell
                              value={d.note ?? ''}
                              align="left"
                              label={`Observații, ${zz(d.work_date)}`}
                              onCommit={(v) => void commit(d, { note: v })}
                            />
                          </td>
                          <td className={`${td} max-w-[320px] border-l border-l-line-2 px-3 text-row text-ink-2`}>
                            {places.map((p) => (
                              <span key={p.label} className="block">
                                <span className="font-semibold text-ink-1">{p.label}:</span> {p.where}
                              </span>
                            ))}
                          </td>
                        </tr>
                      )
                    })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {days.length === 0 && <EmptyState title="Jurnalul e gol">Alege data și apasă „Adaugă zi”.</EmptyState>}

      {panel && (
        <DayPanel
          key={panel.date}
          data={data}
          day={days.find((d) => d.work_date === panel.date) ?? null}
          date={panel.date}
          onClose={() => setPanel(null)}
          onSaved={setData}
        />
      )}
    </Card>
  )
}
