// „Ce urmează" — planificarea pe interval scurt (următoarele 2 săptămâni).
// Nu cere NICIO informație nouă: totul se deduce din datele de plan ale
// taskurilor + cantitățile rămase pe livrabile. E versiunea ușoară a ceea ce
// firmele mari numesc short-interval planning / lookahead.
import { useMemo, useState } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import { todayIso } from '../data/projects'
import { deliverablePct, taskPct } from '../domain/kpi'
import { addDays } from '../components/gantt/ganttScale'
import { compact, dataRo, dataScurt, lei, num, pct } from '../lib/format'
import {
  Card,
  EmptyState,
  ProgressBar,
  StatCard,
  StatusPill,
  TableFooter,
  TableHead,
  TableRow,
} from '../components/ui'
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

// Lățimile coloanelor, ținute într-un singur loc ca antetul și rândurile să nu
// se desincronizeze niciodată.
const COL_PERIOD = 'w-[150px] shrink-0'
const COL_PROGRESS = 'w-[150px] shrink-0'
const COL_VALUE = 'w-[112px] shrink-0 text-right'
const COL_STATUS = 'w-[104px] shrink-0 text-right'

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
  const totalValue = items.reduce((s, i) => s + i.value, 0)

  return (
    <div className="mx-auto max-w-[1800px] px-8 py-6">
      <PageHeader
        title="Ce urmează"
        pill={`${dataRo(today)} – ${dataRo(horizon)}`}
        action={
          // ținta de atingere e tot dreptunghiul de 40px, nu doar pătrățelul
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-btn border border-line-2 bg-paper-0 px-3 text-row font-medium text-ink-2 transition-colors duration-[120ms] ease-std hover:bg-paper-1">
            <input
              type="checkbox"
              checked={onlyUnfinished}
              onChange={(e) => setOnlyUnfinished(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-accent"
            />
            Doar ce nu e terminat
          </label>
        }
      />

      <div className="space-y-4">
        {/* rezumatul ferestrei */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="În lucru"
            value={num(items.length)}
            footnote="taskuri ating fereastra"
          />
          <StatCard
            label="Încep"
            value={num(starting)}
            footnote="pornesc în aceste 2 săptămâni"
          />
          <StatCard
            label="Trebuie terminate"
            value={num(ending)}
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
          <Card className="!p-0">
            <EmptyState title="Nimic planificat în următoarele două săptămâni">
              Pune date de plan pe taskuri (în Gantt sau în panoul de detaliu) ca să apară aici.
            </EmptyState>
          </Card>
        ) : (
          /* un singur tabel, ca registrul din referință: rânduri despărțite de
             linii subțiri, coloane aliniate — nu un teanc de cartonașe */
          <Card className="overflow-hidden !p-0">
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <TableHead>
                  <span className="min-w-0 flex-1">Task</span>
                  <span className={COL_PERIOD}>Perioadă</span>
                  <span className={COL_PROGRESS}>Progres</span>
                  <span className={COL_VALUE}>Valoare</span>
                  <span className={COL_STATUS}>Status</span>
                </TableHead>

                {items.map((i) => (
                  <TableRow
                    key={i.taskId}
                    onClick={() =>
                      onOpen({ projectId: i.projectId, jobId: i.jobId, taskId: i.taskId })
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-1">{i.taskName}</p>
                      <p className="truncate text-sub text-ink-3">
                        {i.projectName} · {i.jobName}
                        {i.remaining.length > 0 && (
                          <span className="text-ink-3"> · mai sunt {i.remaining.join(' · ')}</span>
                        )}
                      </p>
                    </div>

                    <div className={COL_PERIOD}>
                      <span className="block text-ink-2">
                        {dataScurt(i.start)} – {dataScurt(i.end)}
                      </span>
                      {i.startsSoon && <span className="block text-meta text-ink-3">începe acum</span>}
                      {i.endsSoon && !i.startsSoon && (
                        <span className="block text-meta text-ink-3">termen în fereastră</span>
                      )}
                      {i.invoiceDate && (
                        <span className="block text-meta text-ink-3">
                          facturare țintă {dataScurt(i.invoiceDate)}
                        </span>
                      )}
                    </div>

                    <div className={`${COL_PROGRESS} flex items-center gap-2`}>
                      <ProgressBar donePct={i.donePct} tone="neutral" className="!h-1.5 flex-1" />
                      <span className="w-12 shrink-0 text-right font-bold tabular-nums text-ink-1">
                        {pct(i.donePct)}
                      </span>
                    </div>

                    <span className={`${COL_VALUE} font-semibold tabular-nums text-ink-1`}>
                      {lei(i.value)}
                    </span>

                    <span className={`${COL_STATUS} flex justify-end`}>
                      <StatusPill status={i.status} />
                    </span>
                  </TableRow>
                ))}

                <TableFooter>
                  <span className="text-ink-3">
                    {items.length} {items.length === 1 ? 'task' : 'taskuri'} în fereastră
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-ink-3">Valoare totală</span>
                    <span className="font-bold tabular-nums text-ink-1">{lei(totalValue)}</span>
                  </span>
                </TableFooter>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
