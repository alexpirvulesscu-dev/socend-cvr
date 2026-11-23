// Jurnalul zilnic: o singură foaie, ca în Excel. Un rând pe zi, coloanele
// Tranșee · Console · Sudură țeavă PEHD (echipa 1, echipa 2) + observații.
// Se scrie direct în celule; se salvează când ieși din celulă.
import { Fragment, useState } from 'react'
import { dayTotals, type DailyColumn } from '../../domain/tracker'
import { azi, deleteDay, saveDay, type DayRow, type TrackerData } from '../../data/tracker'
import { num, toNum } from '../../lib/format'
import { Card, EmptyState, PrimaryButton } from '../../components/ui'
import { toast } from '../../components/Toast'

const ZI = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ']
const dow = (iso: string) => new Date(iso + 'T00:00:00Z').getUTCDay()
const zz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`
const fmt = (v: number | undefined) => (v ? num(v, Number.isInteger(v) ? 0 : 1) : '')

const cellInput =
  'h-9 w-full rounded-[8px] border border-transparent bg-transparent px-2 text-right text-row tabular-nums text-ink-1 hover:border-line-2 focus:border-accent focus:bg-paper-0'

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

export function JurnalZilnic({ data, setData }: { data: TrackerData; setData: (d: TrackerData) => void }) {
  const cfg = data.tracker.config
  const cols = cfg.dailyColumns ?? []
  const groups = cfg.groups ?? []
  const days = data.days
  const totals = dayTotals(days, cols)

  const [newDate, setNewDate] = useState(azi())
  const [newQty, setNewQty] = useState<Record<string, string>>({})
  const [newNote, setNewNote] = useState('')
  const [busy, setBusy] = useState(false)

  function put(row: DayRow) {
    const rest = data.days.filter((d) => d.work_date !== row.work_date)
    setData({ ...data, days: [...rest, row].sort((a, b) => (a.work_date < b.work_date ? 1 : -1)) })
  }

  async function commit(day: DayRow, patch: { col?: string; value?: string; note?: string }) {
    const qty = { ...day.qty }
    if (patch.col) qty[patch.col] = toNum(patch.value ?? '')
    const note = patch.note !== undefined ? patch.note.trim() || null : day.note
    try {
      put(await saveDay(data.tracker.id, { work_date: day.work_date, qty: cleanQty(cols, qty), note }))
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    }
  }

  async function add() {
    if (days.some((d) => d.work_date === newDate))
      return toast('Ziua există deja în jurnal. Scrie direct în rândul ei.')
    const qty: Record<string, number> = {}
    for (const c of cols) qty[c.id] = toNum(newQty[c.id] ?? '')
    const clean = cleanQty(cols, qty)
    if (!Object.keys(clean).length && !newNote.trim()) return toast('Scrie cel puțin o cantitate sau o observație.')
    setBusy(true)
    try {
      put(await saveDay(data.tracker.id, { work_date: newDate, qty: clean, note: newNote.trim() || null }))
      setNewQty({})
      setNewNote('')
      toast('Zi adăugată', 'success')
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  async function remove(day: DayRow) {
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
  const sticky = 'sticky left-0 z-[1] bg-paper-0'

  return (
    <Card
      title="Jurnal zilnic"
      subtitle="Un rând pe zi. Scrii direct în celule, ca în Excel; se salvează când treci la altă celulă."
      className="!px-0"
    >
      <div className="overflow-x-auto">
        <table className="w-max border-separate border-spacing-0">
          <thead>
            <tr>
              <th className={`${th} ${sticky} border-b-0`} />
              {groups.map((g) => {
                const n = cols.filter((c) => c.group === g.id).length
                return n ? (
                  <th key={g.id} colSpan={n} className="border-b border-line-2 px-2 pt-1 pb-1.5 text-center text-sub font-semibold text-ink-1">
                    {g.label}
                  </th>
                ) : null
              })}
              <th className="border-b-0" colSpan={2} />
            </tr>
            <tr>
              <th className={`${th} ${sticky} pl-5 text-left`}>Data</th>
              {cols.map((c) => (
                <th key={c.id} className={`${th} w-[84px] text-right`}>
                  <span className="ml-auto block max-w-[84px] whitespace-normal">{c.label}</span>
                  <span className="block normal-case tracking-normal text-ink-4">{c.unit}</span>
                </th>
              ))}
              <th className={`${th} min-w-[260px] text-left`}>Observații</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {/* rândul nou */}
            <tr className="bg-accent-soft/40">
              <td className={`${td} ${sticky} !bg-paper-1 pl-4`}>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  aria-label="Data zilei noi"
                  className="h-9 rounded-[8px] border border-line-2 bg-paper-0 px-2 text-row text-ink-1 focus:border-accent"
                />
              </td>
              {cols.map((c) => (
                <td key={c.id} className={`${td} bg-paper-1`}>
                  <input
                    inputMode="decimal"
                    size={5}
                    value={newQty[c.id] ?? ''}
                    aria-label={`${c.label} (zi nouă)`}
                    onChange={(e) => setNewQty({ ...newQty, [c.id]: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && void add()}
                    className={`${cellInput} !border-line-2 !bg-paper-0`}
                  />
                </td>
              ))}
              <td className={`${td} bg-paper-1`}>
                <input
                  value={newNote}
                  size={32}
                  aria-label="Observații (zi nouă)"
                  placeholder="ex. a plouat, s-a lucrat doar dimineața"
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void add()}
                  className={`${cellInput} !text-left !border-line-2 !bg-paper-0`}
                />
              </td>
              <td className={`${td} bg-paper-1 pr-4`}>
                <PrimaryButton onClick={() => void add()} disabled={busy}>
                  Adaugă
                </PrimaryButton>
              </td>
            </tr>

            {/* totalul */}
            <tr>
              <td className={`${td} ${sticky} py-2.5 pl-5 text-row font-bold text-ink-1`}>Total</td>
              {cols.map((c) => (
                <td key={c.id} className={`${td} px-3 text-right text-row font-bold tabular-nums text-ink-1`}>
                  {fmt(totals[c.id]) || '0'}
                </td>
              ))}
              <td className={`${td} px-3 text-sub text-ink-3`}>
                {days.length} {days.length === 1 ? 'zi' : 'zile'} în jurnal
              </td>
              <td className={td} />
            </tr>

            {days.map((d) => (
              <Fragment key={d.id}>
                <tr className="hover:bg-paper-1">
                  <td className={`${td} ${sticky} whitespace-nowrap py-2 pl-5 pr-3 text-row font-semibold text-ink-1`}>
                    <span className="inline-block w-6 text-ink-3">{ZI[dow(d.work_date)]}</span> {zz(d.work_date)}
                  </td>
                  {cols.map((c) => (
                    <td key={c.id} className={td}>
                      <Cell
                        value={fmt(d.qty[c.id])}
                        label={`${c.label}, ${zz(d.work_date)}`}
                        onCommit={(v) => void commit(d, { col: c.id, value: v })}
                      />
                    </td>
                  ))}
                  <td className={`${td} max-w-[420px]`}>
                    <Cell
                      value={d.note ?? ''}
                      align="left"
                      label={`Observații, ${zz(d.work_date)}`}
                      onCommit={(v) => void commit(d, { note: v })}
                    />
                  </td>
                  <td className={`${td} pr-4 text-right`}>
                    <button
                      onClick={() => void remove(d)}
                      aria-label={`Șterge ziua ${zz(d.work_date)}`}
                      className="rounded-btn px-2 py-1 text-sub font-semibold text-ink-4 hover:text-neg"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {days.length === 0 && (
        <EmptyState title="Jurnalul e gol">Scrie prima zi în rândul de sus.</EmptyState>
      )}
    </Card>
  )
}
