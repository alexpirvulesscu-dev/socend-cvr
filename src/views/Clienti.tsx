// Clienții: cei trei clienți-contract, apoi lucrările fiecăruia.
// O lucrare e fie un proiect întreg (Peștișani, Susita), fie un job dintr-un
// proiect (Vidraru, Termoficare). Datele de bani și ore rămân pe proiect, ca în P&L.
import type { ProjectWithKpis } from '../data/projects'
import { useClients, type ClientItem, type ClientRow } from '../data/clients'
import { compact, pct } from '../lib/format'
import { BackLink, Card, EmptyState, ErrorStrip, Pill, ProgressBar, Skeleton } from '../components/ui'
import { PageHeader } from '../components/Shell'
import type { Selection } from '../lib/selection'

interface Lucrare {
  item: ClientItem
  name: string
  parent: string | null
  value: number
  ev: number
  donePct: number
  planPct: number
  projectId: string
  jobId: string | null
}

function lucrari(c: ClientRow, projects: ProjectWithKpis[]): Lucrare[] {
  const out: Lucrare[] = []
  for (const it of c.cvr_client_items) {
    const p = projects.find((x) => x.id === it.project_id)
    if (!p) continue
    if (it.job_id) {
      const j = p.jobs.find((x) => x.id === it.job_id)
      if (!j) continue
      out.push({
        item: it,
        name: it.label ?? j.name,
        parent: p.name,
        value: j.kpis.value,
        ev: j.kpis.ev,
        donePct: j.kpis.donePct,
        planPct: j.kpis.planPct,
        projectId: p.id,
        jobId: j.id,
      })
    } else {
      out.push({
        item: it,
        name: it.label ?? p.name,
        parent: null,
        value: Number(p.contract_value),
        ev: p.kpis.ev,
        donePct: p.kpis.donePct,
        planPct: p.kpis.planPct,
        projectId: p.id,
        jobId: null,
      })
    }
  }
  return out
}

function Cifre({ value, ev }: { value: number; ev: number }) {
  return (
    <p className="mt-0.5 text-sub text-ink-3 tabular-nums">
      {value > 0 ? `${compact(ev)} din ${compact(value)} lei executat` : 'fără valoare încă'}
    </p>
  )
}

export function ClientiView({
  projects,
  trackerKeys,
  onOpen,
  openId,
  setOpenId,
}: {
  projects: ProjectWithKpis[]
  /** „projectId" sau „projectId/jobId" pentru lucrările care au tracker */
  trackerKeys: Set<string>
  onOpen: (sel: Selection) => void
  /** clientul deschis (ținut în App, ca „Înapoi" din proiect să revină aici) */
  openId: string | null
  setOpenId: (id: string | null) => void
}) {
  const { clients, error } = useClients()

  if (error) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
        <ErrorStrip message={`Nu am putut încărca clienții: ${error}`} />
      </div>
    )
  }
  if (!clients) {
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    )
  }

  const client = clients.find((c) => c.id === openId)
  const hasTracker = (l: Lucrare) =>
    trackerKeys.has(l.jobId ? `${l.projectId}/${l.jobId}` : l.projectId)

  if (client) {
    const list = lucrari(client, projects)
    return (
      <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
        <PageHeader title={client.name} back={<BackLink label="Clienți" onClick={() => setOpenId(null)} />} />
        {list.length === 0 ? (
          <Card>
            <EmptyState title="Nicio lucrare aici">Lucrările acestui client nu sunt încă în CVR.</EmptyState>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {list.map((l) => (
              <Card
                key={l.item.id}
                className="!p-5"
                onClick={() => onOpen({ projectId: l.projectId, jobId: l.jobId ?? undefined })}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-card font-semibold text-ink-1">{l.name}</h3>
                    {l.parent && <p className="mt-0.5 truncate text-sub text-ink-3">din {l.parent}</p>}
                  </div>
                  {hasTracker(l) && <Pill tone="info">Tracker</Pill>}
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <ProgressBar donePct={l.donePct} planPct={l.value > 0 ? l.planPct : undefined} className="flex-1" />
                  <span className="w-11 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
                    {pct(l.donePct)}
                  </span>
                </div>
                <Cifre value={l.value} ev={l.ev} />
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8">
      <PageHeader title="Clienți" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {clients.map((c) => {
          const list = lucrari(c, projects)
          const value = list.reduce((s, l) => s + l.value, 0)
          const ev = list.reduce((s, l) => s + l.ev, 0)
          return (
            <Card key={c.id} className="!p-5" onClick={() => setOpenId(c.id)}>
              <h3 className="text-card font-semibold text-ink-1">{c.name}</h3>
              <p className="mt-0.5 text-sub text-ink-3">
                {list.length} {list.length === 1 ? 'proiect' : 'proiecte'}
              </p>
              <ul className="mt-3 space-y-1">
                {list.map((l) => (
                  <li key={l.item.id} className="flex justify-between gap-3 text-row text-ink-2">
                    <span className="truncate">{l.name}</span>
                    <span className="shrink-0 tabular-nums text-ink-3">{pct(l.donePct)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-3">
                <ProgressBar donePct={value > 0 ? ev / value : 0} className="flex-1" />
                <span className="w-11 shrink-0 text-right text-row font-bold tabular-nums text-ink-1">
                  {pct(value > 0 ? ev / value : 0)}
                </span>
              </div>
              <Cifre value={value} ev={ev} />
            </Card>
          )
        })}
      </div>
    </div>
  )
}
