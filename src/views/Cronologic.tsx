// „Vedere cronologică" — matricea pe zile a unui job, pe TOATĂ lățimea paginii
// (fără scroll orizontal pe desktop). Coloane de totaluri extinse: luna afișată,
// REALIZAT (de la început) vs TOTAL, rămas și procent — plus o bandă de
// indicatori (oameni-zile, zile active, medie) pentru decizii rapide.
import { useMemo, useState } from 'react'
import type { JobWithKpis } from '../data/projects'
import { useMonthData } from '../data/cronologic'
import { num, pct } from '../lib/format'
import { BackLink, Card } from '../components/ui'

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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="space-y-0.5 !p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">{label}</p>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="text-xs text-[#5B6673]">{hint}</p>}
    </Card>
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

  // ── Indicatorii lunii (pentru banda de decizie) ──
  const stats = useMemo(() => {
    if (!data) return null
    let manDaysMonth = 0
    const activeDates = new Set<string>()
    for (const t of job.tasks) {
      const byDay = data.workers[t.id] ?? {}
      for (const [date, w] of Object.entries(byDay)) {
        manDaysMonth += w
        if (w > 0) activeDates.add(date)
      }
    }
    let activeDeliverables = 0
    for (const dl of job.tasks.flatMap((t) => t.deliverables)) {
      const byDay = data.qty[dl.id] ?? {}
      const sum = Object.values(byDay).reduce((s, v) => s + v, 0)
      if (sum > 0) {
        activeDeliverables++
        for (const [date, v] of Object.entries(byDay)) if (v > 0) activeDates.add(date)
      }
    }
    const manDaysAll = Object.values(data.allTimeWorkers).reduce((s, v) => s + v, 0)
    return {
      manDaysMonth,
      manDaysAll,
      activeDays: activeDates.size,
      avgPerDay: activeDates.size > 0 ? manDaysMonth / activeDates.size : 0,
      activeDeliverables,
      totalDeliverables: deliverableIds.length,
    }
  }, [data, job, deliverableIds])

  // stiluri de celulă — compacte, ca totul să încapă pe lățimea paginii
  const dayCell = 'h-8 px-0 text-center text-[11px] tabular-nums'
  const qtyCell = `${dayCell} bg-[#DDEDDC] font-medium text-[#2F6B1F]`
  const workersCell = `${dayCell} bg-[#E3EDF3] text-[#115468]`
  const emptyCell = `${dayCell} text-[#D8D4CB]`
  const totalCell = 'px-1 text-center text-xs font-semibold tabular-nums'
  const totalMuted = 'px-1 text-center text-xs tabular-nums text-[#5B6673]'

  return (
    <div className="w-full space-y-4 px-6 py-6">
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

      {/* Banda de indicatori — numerele de decizie ale lunii */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat
            label="Oameni-zile · luna asta"
            value={num(stats.manDaysMonth)}
            hint="suma oamenilor din Pontaj, zi cu zi"
          />
          <Stat
            label="Oameni-zile · de la început"
            value={num(stats.manDaysAll)}
            hint="pe tot jobul, toate lunile"
          />
          <Stat
            label="Zile active · luna asta"
            value={num(stats.activeDays)}
            hint="zile cu oameni sau cantități raportate"
          />
          <Stat
            label="Medie oameni / zi activă"
            value={num(stats.avgPerDay, 1)}
            hint="oameni-zile ÷ zile active"
          />
          <Stat
            label="Livrabile lucrate · luna asta"
            value={`${num(stats.activeDeliverables)} din ${num(stats.totalDeliverables)}`}
            hint="livrabile cu cantități raportate"
          />
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-[20px] bg-white shadow-[0_1px_2px_rgba(13,26,45,0.04),0_8px_24px_rgba(13,26,45,0.06)]">
          {/* min-w: sub ~1080px tabelul derulează; peste, umple TOATĂ lățimea paginii */}
          <table className="w-full min-w-[1080px] table-fixed border-collapse">
            <colgroup>
              <col className="w-44" />
              {days.map(({ d }) => (
                <col key={d} />
              ))}
              <col className="w-14" />
              <col className="w-16" />
              <col className="w-14" />
              <col className="w-14" />
              <col className="w-12" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                  Task / livrabil
                </th>
                {days.map(({ d, dow }) => (
                  <th key={d} className={`${dayCell} py-1.5 font-medium ${dow === 0 ? 'text-[#C9C5BC]' : ''}`}>
                    <span className="block text-xs font-semibold">{d}</span>
                    <span
                      className={`block text-[9px] ${
                        dow === 6 ? 'text-[#A87400]' : dow === 0 ? 'text-[#C9C5BC]' : 'text-[#5B6673]'
                      }`}
                    >
                      {WEEKDAY_RO[dow]}
                    </span>
                  </th>
                ))}
                <th className="border-l border-[#E8E8E8] px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5B6673]">
                  Lună
                </th>
                <th className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5B6673]">
                  Realizat
                </th>
                <th className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5B6673]">
                  Total
                </th>
                <th className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5B6673]">
                  Rămas
                </th>
                <th className="px-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#5B6673]">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {job.tasks.map((t, ti) => {
                const workersByDay = data.workers[t.id] ?? {}
                const workersMonth = days.reduce((s, { date }) => s + (workersByDay[date] ?? 0), 0)
                const workersAll = data.allTimeWorkers[t.id] ?? 0
                return (
                  <FragmentRows
                    key={t.id}
                    taskLabel={`${String(ti + 1).padStart(2, '0')} · ${t.name}`}
                    colSpan={days.length + 6}
                    rows={
                      <>
                        {t.deliverables.map((dl) => {
                          const byDay = data.qty[dl.id] ?? {}
                          const monthTotal = days.reduce((s, { date }) => s + (byDay[date] ?? 0), 0)
                          const done = Number(dl.qty_done)
                          const total = Number(dl.qty_total)
                          const remaining = Math.max(0, total - done)
                          return (
                            <tr key={dl.id} className="border-t border-[#F3F1EC]">
                              <td className="truncate px-3 py-1 text-xs">
                                {dl.name} <span className="text-[10px] text-[#5B6673]">{dl.um}</span>
                              </td>
                              {days.map(({ date, dow }) => {
                                const v = byDay[date]
                                return (
                                  <td key={date} className={v ? qtyCell : emptyCell}>
                                    {v ? num(v) : dow === 0 ? '' : '–'}
                                  </td>
                                )
                              })}
                              <td className={`border-l border-[#E8E8E8] ${totalCell}`}>
                                {monthTotal > 0 ? num(monthTotal) : '–'}
                              </td>
                              <td className={`${totalCell} text-[#2F6B1F]`}>{num(done)}</td>
                              <td className={totalMuted}>{num(total)}</td>
                              <td className={totalMuted}>{num(remaining)}</td>
                              <td className={totalMuted}>
                                {total > 0 ? pct(done / total, 0) : '–'}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="border-t border-[#F3F1EC]">
                          <td className="truncate px-3 py-1 text-xs text-[#115468]">
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
                          <td className={`border-l border-[#E8E8E8] ${totalCell} text-[#115468]`}>
                            {workersMonth > 0 ? num(workersMonth) : '–'}
                          </td>
                          <td className={`${totalCell} text-[#115468]`}>
                            {workersAll > 0 ? num(workersAll) : '–'}
                          </td>
                          <td className={totalMuted}>–</td>
                          <td className={totalMuted}>–</td>
                          <td className={totalMuted}>–</td>
                        </tr>
                      </>
                    }
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-[#5B6673]">
        Coloanele de totaluri: <strong>Lună</strong> = raportat în luna afișată ·{' '}
        <strong>Realizat</strong> = de la începutul jobului (la „Oameni": total oameni-zile) ·{' '}
        <strong>Total</strong> = cantitatea contractată · <strong>Rămas</strong> = de construit ·{' '}
        <strong>%</strong> = realizat din total.
      </p>
    </div>
  )
}

/** Banda de secțiune a taskului + rândurile lui. */
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
          className="border-t border-[#E8E8E8] bg-[#FAF9F6] px-3 py-1.5 text-sm font-semibold"
        >
          {taskLabel}
        </td>
      </tr>
      {rows}
    </>
  )
}
