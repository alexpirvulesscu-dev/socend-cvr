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
import { Card, ProgressBar, StatCard, StatusPill } from '../components/ui'
import { PageHeader } from '../components/Shell'
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
    <div className="mx-auto max-w-[1800px] px-8 py-6">
      <PageHeader
        title="Ce urmează"
        pill={`${dataRo(today)} – ${dataRo(horizon)}`}
        action={
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#5B6673]">
            <input
              type="checkbox"
              checked={onlyUnfinished}
              onChange={(e) => setOnlyUnfinished(e.target.checked)}
              className="h-4 w-4 accent-[#58A834]"
            />
            Doar ce nu e terminat
          </label>
        }
      />

      <div className="space-y-4">
      {/* rezumatul ferestrei */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="În lucru"
          value={String(items.length)}
          footnote="taskuri ating fereastra"
        />
        <StatCard
          label="Încep"
          value={String(starting)}
          footnote="pornesc în aceste 2 săptămâni"
        />
        <StatCard
          label="Trebuie terminate"
          value={String(ending)}
          footnote="au termenul în fereastră"
        />
        <StatCard
          label="De facturat"
          value={`${compact(valueToInvoice)} lei`}
          footnote={
            toInvoice.length === 0
              ? 'nicio țintă de facturare'
              : `${toInvoice.length} ${toInvoice.length === 1 ? 'task' : 'taskuri'} cu țintă în fereastră`
          }
        />
      </div>

      {items.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="font-medium">Nimic planificat în următoarele două săptămâni</p>
          <p className="mt-1 text-sm text-[#5B6673]">
            Pune date de plan pe taskuri (în Gantt sau în panoul de detaliu) ca să apară aici.
          </p>
        </Card>
      ) : (
        /* un singur tabel, ca registrul din referință: rânduri despărțite de
           linii subțiri, coloane aliniate — nu un teanc de cartonașe */
        <Card className="!p-0">
          <div className="flex items-center gap-4 border-b border-[#F0EFEC] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
            <span className="min-w-0 flex-1">Task</span>
            <span className="hidden w-[190px] shrink-0 lg:block">Perioadă</span>
            <span className="w-[132px] shrink-0">Progres</span>
            <span className="w-[80px] shrink-0 text-right">Valoare</span>
            <span className="w-[104px] shrink-0 text-right">Status</span>
          </div>
          {items.map((i) => (
            <div
              key={i.taskId}
              role="button"
              tabIndex={0}
              onClick={() => onOpen({ projectId: i.projectId, jobId: i.jobId, taskId: i.taskId })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onOpen({ projectId: i.projectId, jobId: i.jobId, taskId: i.taskId })
                }
              }}
              className="flex cursor-pointer items-center gap-4 border-b border-[#F0EFEC] px-5 py-3 transition-colors last:border-0 hover:bg-[#FAF9F6] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#58A834]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{i.taskName}</p>
                <p className="truncate text-xs text-[#5B6673]">
                  {i.projectName} · {i.jobName}
                  {i.remaining.length > 0 && (
                    <span className="text-[#C9C5BC]"> · mai sunt {i.remaining.join(' · ')}</span>
                  )}
                </p>
              </div>

              <div className="hidden w-[190px] shrink-0 text-xs text-[#5B6673] lg:block">
                {dataRo(i.start)} – {dataRo(i.end)}
                {i.startsSoon && <span className="block text-[#0D1A2D]">începe acum</span>}
                {i.endsSoon && !i.startsSoon && (
                  <span className="block font-medium text-[#0D1A2D]">termen în fereastră</span>
                )}
                {i.invoiceDate && (
                  <span className="block">facturare țintă {dataRo(i.invoiceDate)}</span>
                )}
              </div>

              <div className="flex w-[132px] shrink-0 items-center gap-2">
                <ProgressBar donePct={i.donePct} className="!h-1.5 flex-1" />
                <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">
                  {pct(i.donePct, 0)}
                </span>
              </div>

              <span className="w-[80px] shrink-0 text-right text-xs tabular-nums text-[#5B6673]">
                {compact(i.value)} lei
              </span>
              <span className="flex w-[104px] shrink-0 justify-end">
                <StatusPill status={i.status} />
              </span>
            </div>
          ))}
        </Card>
      )}
      </div>
    </div>
  )
}
