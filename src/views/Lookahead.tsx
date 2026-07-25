// „Ce urmează" — planificarea pe interval scurt (următoarele 2 săptămâni).
// Nu cere NICIO informație nouă: totul se deduce din datele de plan ale
// taskurilor + cantitățile rămase pe livrabile. E versiunea ușoară a ceea ce
// firmele mari numesc short-interval planning / lookahead.
import { useMemo, useState } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import { todayIso } from '../data/projects'
import { deliverablePct, taskPct } from '../domain/kpi'
import { addDays } from '../components/gantt/ganttScale'
import { compact, dataRo, num, pct } from '../lib/format'
import { Card, ProgressBar, StatusPill } from '../components/ui'
import type { Selection } from '../lib/selection'

interface Item {
  projectName: string
  jobName: string
  taskName: string
  taskId: string
  projectId: string
  jobId: string
  status: 'neinceput' | 'in_lucru' | 'finalizat'
  start: string
  end: string
  donePct: number
  value: number
  invoiceDate: string | null
  /** ce a mai rămas de făcut, pe livrabile: „38 m țeavă · 62 buc suduri" */
  remaining: string[]
  /** începe în fereastră (nu e deja în lucru) */
  startsSoon: boolean
  endsSoon: boolean
}

const HORIZON_DAYS = 14

export function LookaheadView({
  projects,
  onOpen,
}: {
  projects: ProjectWithKpis[]
  onOpen: (sel: Selection) => void
}) {
  const today = todayIso()
  const horizon = addDays(today, HORIZON_DAYS - 1)
  const [onlyUnfinished, setOnlyUnfinished] = useState(true)

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const p of projects) {
      if (!p.active) continue
      for (const j of p.jobs) {
        for (const t of j.tasks) {
          const start = t.start_date ?? j.start_date
          const end = t.end_date ?? j.end_date
          // taskul atinge fereastra dacă începe înainte de finalul ei și nu s-a terminat
          if (start > horizon || end < today) continue
          const done = taskPct(
            t.deliverables.map((d) => ({
              qtyTotal: Number(d.qty_total),
              qtyDone: Number(d.qty_done),
              weight: Number(d.weight),
            }))
          )
          if (onlyUnfinished && (t.status === 'finalizat' || done >= 1)) continue
          const remaining = t.deliverables
            .filter((d) => deliverablePct(Number(d.qty_done), Number(d.qty_total)) < 1)
            .map((d) => `${num(Number(d.qty_total) - Number(d.qty_done))} ${d.um} ${d.name}`)
          out.push({
            projectName: p.name,
            jobName: j.name,
            taskName: t.name,
            taskId: t.id,
            projectId: p.id,
            jobId: j.id,
            status: t.status,
            start,
            end,
            donePct: done,
            value: Number(t.value),
            invoiceDate: t.target_invoice_date,
            remaining,
            startsSoon: start >= today,
            endsSoon: end <= horizon,
          })
        }
      }
    }
    // ce se termină primul, primul în listă
    return out.sort((a, b) => (a.end === b.end ? a.start.localeCompare(b.start) : a.end.localeCompare(b.end)))
  }, [projects, today, horizon, onlyUnfinished])

  const starting = items.filter((i) => i.startsSoon).length
  const ending = items.filter((i) => i.endsSoon).length
  const toInvoice = items.filter(
    (i) => i.invoiceDate && i.invoiceDate >= today && i.invoiceDate <= horizon
  )
  const valueToInvoice = toInvoice.reduce((s, i) => s + i.value, 0)

  return (
    <div className="mx-auto max-w-[1800px] space-y-4 px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ce urmează</h1>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            Taskurile active în următoarele două săptămâni ({dataRo(today)} – {dataRo(horizon)}) și
            ce a mai rămas de făcut la fiecare.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[#5B6673]">
          <input
            type="checkbox"
            checked={onlyUnfinished}
            onChange={(e) => setOnlyUnfinished(e.target.checked)}
            className="h-4 w-4 accent-[#58A834]"
          />
          Doar ce nu e terminat
        </label>
      </div>

      {/* rezumatul ferestrei */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="!p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
            În lucru
          </p>
          <p className="mt-1 text-xl font-semibold">{items.length}</p>
          <p className="text-[11px] text-[#5B6673]">taskuri ating fereastra</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">Încep</p>
          <p className="mt-1 text-xl font-semibold">{starting}</p>
          <p className="text-[11px] text-[#5B6673]">pornesc în aceste 2 săptămâni</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
            Trebuie terminate
          </p>
          <p className="mt-1 text-xl font-semibold">{ending}</p>
          <p className="text-[11px] text-[#5B6673]">au termenul în fereastră</p>
        </Card>
        <Card className="!p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
            De facturat
          </p>
          <p className="mt-1 text-xl font-semibold">{compact(valueToInvoice)} lei</p>
          <p className="text-[11px] text-[#5B6673]">
            {toInvoice.length === 0
              ? 'nicio țintă de facturare'
              : `${toInvoice.length} taskuri cu țintă în fereastră`}
          </p>
        </Card>
      </div>

      {items.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="font-medium">Nimic planificat în următoarele două săptămâni</p>
          <p className="mt-1 text-sm text-[#5B6673]">
            Pune date de plan pe taskuri (în Gantt sau în panoul de detaliu) ca să apară aici.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <Card
              key={i.taskId}
              className="!p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(13,26,45,0.09)]"
              onClick={() => onOpen({ projectId: i.projectId, jobId: i.jobId, taskId: i.taskId })}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{i.taskName}</p>
                  <p className="truncate text-xs text-[#5B6673]">
                    {i.projectName} · {i.jobName}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill status={i.status} />
                  <span className="text-xs text-[#5B6673]">{compact(i.value)} lei</span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-3">
                <ProgressBar donePct={i.donePct} className="!h-1.5 flex-1" />
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums">
                  {pct(i.donePct, 0)}
                </span>
              </div>

              <p className="mt-1.5 text-xs text-[#5B6673]">
                {dataRo(i.start)} – {dataRo(i.end)}
                {i.startsSoon && <span className="text-[#0D1A2D]"> · începe acum</span>}
                {i.endsSoon && !i.startsSoon && (
                  <span className="font-medium text-[#0D1A2D]"> · termen în fereastră</span>
                )}
                {i.invoiceDate && (
                  <span> · facturare țintă {dataRo(i.invoiceDate)}</span>
                )}
              </p>

              {i.remaining.length > 0 && (
                <p className="mt-1 text-xs text-[#0D1A2D]">
                  <span className="text-[#5B6673]">Mai sunt: </span>
                  {i.remaining.join(' · ')}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
