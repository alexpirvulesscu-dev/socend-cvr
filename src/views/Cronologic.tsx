// „Vedere cronologică" — matricea pe zile a unui job, ca în design:
// coloane = zilele lunii (duminicile stinse, sâmbetele marcate), rânduri =
// taskuri → livrabile + rândul „Oameni · Pontaj", coloane de total și rămas.
import { useMemo, useState } from 'react'
import type { JobWithKpis } from '../data/projects'
import { useMonthData } from '../data/cronologic'
import { num } from '../lib/format'
import { BackLink } from '../components/ui'

const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]
const WEEKDAY_RO = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[#5B6673]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

export function CronologicView({
  job,
  onBack,
}: {
  job: JobWithKpis
  onBack: () => void
}) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-based

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1
        const dow = new Date(year, month, d).getDay()
        return { d, date: iso(year, month, d), dow }
      }),
    [year, month, daysInMonth]
  )

  const deliverableIds = useMemo(
    () => job.tasks.flatMap((t) => t.deliverables.map((dl) => dl.id)),
    [job]
  )
  const taskIds = useMemo(() => job.tasks.map((t) => t.id), [job])

  const { data, loading, error } = useMonthData(
    deliverableIds,
    taskIds,
    iso(year, month, 1),
    iso(year, month, daysInMonth)
  )

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  // stiluri de celulă
  const cellBase = 'h-9 min-w-9 px-1 text-center text-xs tabular-nums'
  const qtyCell = `${cellBase} bg-[#DDEDDC] font-medium text-[#2F6B1F]`
  const workersCell = `${cellBase} bg-[#E3EDF3] text-[#115468]`
  const emptyCell = `${cellBase} text-[#C9C5BC]`

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <BackLink label={job.name} onClick={onBack} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vedere cronologică · {job.name}</h1>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            Cantități raportate pe zile · oamenii vin din Pontaj
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-3 sm:flex">
            <LegendDot color="#58A834" label="cantitate" />
            <LegendDot color="#9DB8C7" label="oameni" />
            <LegendDot color="#E2E04A" label="sâmbătă" />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => shiftMonth(-1)}
              aria-label="Luna anterioară"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(13,26,45,0.08)] hover:bg-[#EEECE7]"
            >
              ‹
            </button>
            <span className="min-w-40 text-center text-sm font-semibold uppercase tracking-wider">
              Luna {MONTHS_RO[month]} {year}
            </span>
            <button
              onClick={() => shiftMonth(1)}
              aria-label="Luna următoare"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(13,26,45,0.08)] hover:bg-[#EEECE7]"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-[#D64545]">Eroare: {error}</p>}
      {loading && <p className="text-sm text-[#5B6673]">Se încarcă…</p>}

      {data && (
        <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_1px_2px_rgba(13,26,45,0.04),0_8px_24px_rgba(13,26,45,0.06)]">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 z-[1] min-w-52 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                  Task / livrabil
                </th>
                {days.map(({ d, dow }) => (
                  <th key={d} className={`${cellBase} py-2 font-medium ${dow === 0 ? 'text-[#C9C5BC]' : ''}`}>
                    <span className="block text-sm font-semibold">{d}</span>
                    <span
                      className={`block text-[10px] ${
                        dow === 6 ? 'text-[#A87400]' : dow === 0 ? 'text-[#C9C5BC]' : 'text-[#5B6673]'
                      }`}
                    >
                      {WEEKDAY_RO[dow]}
                    </span>
                  </th>
                ))}
                <th className="min-w-20 border-l border-[#E8E8E8] px-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                  Total lună
                </th>
                <th className="min-w-16 px-2 text-center text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                  Rămas
                </th>
              </tr>
            </thead>
            <tbody>
              {job.tasks.map((t, ti) => {
                const workersByDay = data.workers[t.id] ?? {}
                const workersTotal = days.reduce((s, { date }) => s + (workersByDay[date] ?? 0), 0)
                return (
                  <FragmentRows
                    key={t.id}
                    taskLabel={`${String(ti + 1).padStart(2, '0')} · ${t.name}`}
                    rows={
                      <>
                        {t.deliverables.map((dl) => {
                          const byDay = data.qty[dl.id] ?? {}
                          const monthTotal = days.reduce((s, { date }) => s + (byDay[date] ?? 0), 0)
                          const remaining = Math.max(0, Number(dl.qty_total) - Number(dl.qty_done))
                          return (
                            <tr key={dl.id} className="border-t border-[#F3F1EC]">
                              <td className="sticky left-0 z-[1] bg-white px-4 py-1.5 text-sm">
                                {dl.name}{' '}
                                <span className="text-xs text-[#5B6673]">{dl.um}</span>
                              </td>
                              {days.map(({ date, dow }) => {
                                const v = byDay[date]
                                return (
                                  <td key={date} className={v ? qtyCell : emptyCell}>
                                    {v ? num(v) : dow === 0 ? '' : '–'}
                                  </td>
                                )
                              })}
                              <td className="border-l border-[#E8E8E8] px-2 text-center text-sm font-semibold tabular-nums">
                                {monthTotal > 0 ? num(monthTotal) : '–'}
                              </td>
                              <td className="px-2 text-center text-sm tabular-nums text-[#5B6673]">
                                {num(remaining)}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="border-t border-[#F3F1EC]">
                          <td className="sticky left-0 z-[1] bg-white px-4 py-1.5 text-sm text-[#115468]">
                            Oameni · Pontaj
                          </td>
                          {days.map(({ date, dow }) => {
                            const v = workersByDay[date]
                            return (
                              <td key={date} className={v ? workersCell : emptyCell}>
                                {v ? num(v) : dow === 0 ? '' : '–'}
                              </td>
                            )
                          })}
                          <td className="border-l border-[#E8E8E8] px-2 text-center text-sm font-semibold tabular-nums text-[#115468]">
                            {workersTotal > 0 ? num(workersTotal) : '–'}
                          </td>
                          <td className="px-2 text-center text-sm text-[#C9C5BC]"></td>
                        </tr>
                      </>
                    }
                    colSpan={days.length + 3}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Banda de secțiune a taskului + rândurile lui (nu există fragment cu key pe <tbody>). */
function FragmentRows({
  taskLabel,
  rows,
  colSpan,
}: {
  taskLabel: string
  rows: React.ReactNode
  colSpan: number
}) {
  return (
    <>
      <tr>
        <td
          colSpan={colSpan}
          className="sticky left-0 border-t border-[#E8E8E8] bg-[#FAF9F6] px-4 py-2 text-sm font-semibold"
        >
          {taskLabel}
        </td>
      </tr>
      {rows}
    </>
  )
}
