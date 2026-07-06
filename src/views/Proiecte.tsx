// Ecranul Proiecte: un card pe proiect, cu bară de progres + reper de plan
// și 3 pastile: grafic (zile), cost (sub/peste buget), marjă.
import type { ProjectWithKpis } from '../data/projects'
import { costColor, marginColor, scheduleColor } from '../domain/kpi'
import { lei, pct } from '../lib/format'
import { Card, KpiPill, ProgressBar, scheduleText } from '../components/ui'

export function ProiecteView({
  projects,
  onOpen,
}: {
  projects: ProjectWithKpis[]
  onOpen: (projectId: string) => void
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Proiecte</h1>

      {projects.map((p) => {
        const k = p.kpis
        const costOk = costColor(k.costVariance)
        return (
          <Card key={p.id} onClick={() => onOpen(p.id)} className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold leading-tight">{p.name}</h2>
              <span className="shrink-0 text-sm text-[#5B6673]">{p.client}</span>
            </div>

            <div>
              <ProgressBar donePct={k.donePct} planPct={k.planPct} />
              <div className="mt-2 flex items-baseline justify-between text-sm">
                <span>
                  <strong>{lei(Math.round(k.ev))}</strong>{' '}
                  <span className="text-[#5B6673]">executat · {pct(k.donePct)}</span>
                </span>
                <span className="text-[#5B6673]">din {lei(p.contract_value)}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <KpiPill color={scheduleColor(k.behindDays)}>{scheduleText(k.behindDays)}</KpiPill>
              <KpiPill color={costOk}>
                {costOk === 'good'
                  ? `${lei(Math.round(k.costVariance))} sub buget`
                  : `${lei(Math.round(-k.costVariance))} peste buget`}
              </KpiPill>
              <KpiPill color={marginColor(k.margin)}>marjă {pct(k.margin)}</KpiPill>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
