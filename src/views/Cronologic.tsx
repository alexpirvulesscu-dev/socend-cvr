// „Vedere cronologică" — matricea pe zile a unui job, pe TOATĂ lățimea paginii
// (fără scroll orizontal pe desktop). Coloane de totaluri extinse: luna afișată,
// REALIZAT (de la început) vs TOTAL, rămas și procent — plus o bandă de
// indicatori (oameni-zile, zile active, medie) pentru decizii rapide.
import { useMemo, useState } from 'react'
import type { JobWithKpis } from '../data/projects'
import { useMonthData } from '../data/cronologic'
import { DASH, num, pct } from '../lib/format'
import { BackLink, ErrorStrip, StatCard } from '../components/ui'
import { PageHeader } from '../components/Shell'

const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
]
const WEEKDAY_RO = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Bulina de legendă — culoarea vine din tokeni, niciodată dintr-un hex. */
function LegendDot({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sub text-ink-3">
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

/** Săgețile de lună: aceeași formă ca butonul fantomă, dar rotundă. */
function MonthArrow({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-line-3 bg-paper-0 text-row font-semibold text-ink-2 transition-colors duration-[120ms] ease-std hover:bg-paper-1"
    >
      {children}
    </button>
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

  // Stiluri de celulă — compacte, ca totul să încapă pe lățimea paginii.
  // Cantitatea e verde (muncă raportată), oamenii sunt informativi (vin din
  // Pontaj, nu sunt un verdict), sâmbăta e doar o bandă de hârtie, iar zilele
  // fără date rămân decor (ink-4).
  // Oameni-zile pot fi fracționate: cine e repartizat pe job sau pe proiect se
  // împarte la taskurile candidate, ca totalul zilei să rămână numărul real de
  // oameni. Zecimala se arată doar când există — altfel „0,4 oameni" ar fi
  // rotunjit la „0" și ar părea că nu a lucrat nimeni.
  const oameni = (v: number) => num(v, Number.isInteger(v) ? 0 : 1)

  const dayCell = 'h-8 px-0 text-center text-meta tabular-nums'
  const qtyCell = `${dayCell} bg-pos-bg font-semibold text-pos-pill`
  const workersCell = `${dayCell} bg-info-bg font-semibold text-info`
  const emptyCell = `${dayCell} text-ink-4`
  const saturdayCell = `${dayCell} bg-paper-1 text-ink-4`
  const totalCell = 'px-1 text-center text-row font-semibold tabular-nums text-ink-1'
  const totalMuted = 'px-1 text-center text-row tabular-nums text-ink-3'
  const totalTh =
    'px-1 text-center text-th font-semibold uppercase tracking-[0.07em] text-ink-3'

  return (
    <div className="w-full px-8 py-6">
      <PageHeader
        title="Vedere cronologică"
        back={<BackLink label={job.name} onClick={onBack} />}
        subtitle={`${job.name} · cantități raportate pe zile · oamenii vin din Pontaj`}
        action={
          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-3 sm:flex">
              <LegendDot dot="bg-pos-fill" label="cantitate" />
              <LegendDot dot="bg-info-fill" label="oameni" />
              <LegendDot dot="bg-line-3" label="sâmbătă" />
            </div>
            <div className="flex items-center gap-1">
              <MonthArrow label="Luna anterioară" onClick={() => shiftMonth(-1)}>
                ‹
              </MonthArrow>
              <span className="min-w-40 text-center text-row font-semibold uppercase tracking-[0.07em] text-ink-2">
                Luna {MONTHS_RO[month]} {year}
              </span>
              <MonthArrow label="Luna următoare" onClick={() => shiftMonth(1)}>
                ›
              </MonthArrow>
            </div>
          </div>
        }
      />

      <div className="space-y-4">
        {error && <ErrorStrip message={`Eroare: ${error}`} />}
        {loading && <p className="text-row text-ink-3">Se încarcă…</p>}

        {/* Banda de indicatori — numerele de decizie ale lunii */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Oameni-zile · luna asta"
              value={num(stats.manDaysMonth, 1)}
              footnote="suma oamenilor din Pontaj, zi cu zi"
            />
            <StatCard
              label="Oameni-zile · de la început"
              value={num(stats.manDaysAll, 1)}
              footnote="pe tot jobul, toate lunile"
            />
            <StatCard
              label="Zile active · luna asta"
              value={num(stats.activeDays)}
              footnote="zile cu oameni sau cantități raportate"
            />
            <StatCard
              label="Medie oameni / zi activă"
              value={num(stats.avgPerDay, 1)}
              footnote="oameni-zile ÷ zile active"
            />
            <StatCard
              label="Livrabile lucrate · luna asta"
              value={`${num(stats.activeDeliverables)} din ${num(stats.totalDeliverables)}`}
              footnote="livrabile cu cantități raportate"
            />
          </div>
        )}

        {data && (
          <div className="overflow-x-auto rounded-card border border-line-2 bg-paper-0 shadow-e1">
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
                  <th className="px-3 py-2 text-left text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
                    Task / livrabil
                  </th>
                  {days.map(({ d, dow }) => (
                    <th
                      key={d}
                      className={`${dayCell} py-1.5 ${dow === 6 ? 'bg-paper-1' : ''}`}
                    >
                      <span
                        className={`block text-row font-semibold ${
                          dow === 0 ? 'text-ink-4' : 'text-ink-2'
                        }`}
                      >
                        {d}
                      </span>
                      <span
                        className={`block text-meta font-medium ${
                          dow === 0 ? 'text-ink-4' : 'text-ink-3'
                        }`}
                      >
                        {WEEKDAY_RO[dow]}
                      </span>
                    </th>
                  ))}
                  <th className={`${totalTh}`}>Lună</th>
                  <th className={totalTh}>Realizat</th>
                  <th className={totalTh}>Total</th>
                  <th className={totalTh}>Rămas</th>
                  <th className={totalTh}>%</th>
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
                              <tr key={dl.id} className="border-t border-line-1">
                                <td className="truncate px-3 py-1 text-row text-ink-1">
                                  {dl.name} <span className="text-meta text-ink-4">{dl.um}</span>
                                </td>
                                {days.map(({ date, dow }) => {
                                  const v = byDay[date]
                                  return (
                                    <td
                                      key={date}
                                      className={
                                        v ? qtyCell : dow === 6 ? saturdayCell : emptyCell
                                      }
                                    >
                                      {v ? num(v) : dow === 0 ? '' : DASH}
                                    </td>
                                  )
                                })}
                                <td className={`${totalCell}`}>
                                  {monthTotal > 0 ? num(monthTotal) : DASH}
                                </td>
                                <td className={`${totalCell} text-pos-pill`}>{num(done)}</td>
                                <td className={totalMuted}>{num(total)}</td>
                                <td className={totalMuted}>{num(remaining)}</td>
                                <td className={totalMuted}>
                                  {total > 0 ? pct(done / total) : DASH}
                                </td>
                              </tr>
                            )
                          })}
                          <tr className="border-t border-line-1">
                            <td className="truncate px-3 py-1 text-row text-info">
                              Oameni · Pontaj
                            </td>
                            {days.map(({ date, dow }) => {
                              const v = workersByDay[date]
                              return (
                                <td
                                  key={date}
                                  className={
                                    v ? workersCell : dow === 6 ? saturdayCell : emptyCell
                                  }
                                >
                                  {v ? oameni(v) : dow === 0 ? '' : DASH}
                                </td>
                              )
                            })}
                            <td className={`${totalCell} text-info`}>
                              {workersMonth > 0 ? oameni(workersMonth) : DASH}
                            </td>
                            <td className={`${totalCell} text-info`}>
                              {workersAll > 0 ? oameni(workersAll) : DASH}
                            </td>
                            <td className={totalMuted}>{DASH}</td>
                            <td className={totalMuted}>{DASH}</td>
                            <td className={totalMuted}>{DASH}</td>
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

        <p className="text-sub text-ink-3">
          Coloanele de totaluri: <strong className="font-semibold text-ink-2">Lună</strong> ={' '}
          raportat în luna afișată ·{' '}
          <strong className="font-semibold text-ink-2">Realizat</strong> = de la începutul jobului
          (la „Oameni": total oameni-zile) ·{' '}
          <strong className="font-semibold text-ink-2">Total</strong> = cantitatea contractată ·{' '}
          <strong className="font-semibold text-ink-2">Rămas</strong> = de construit ·{' '}
          <strong className="font-semibold text-ink-2">%</strong> = realizat din total.
        </p>
      </div>
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
          className="border-t border-line-2 bg-paper-1 px-3 py-1.5 text-row font-semibold text-ink-1"
        >
          {taskLabel}
        </td>
      </tr>
      {rows}
    </>
  )
}
