// Ecranul Proiecte:
//  - lista principală (proiectele active mari), ordonabilă prin DRAG & DROP
//  - banda „Companie · toate proiectele" cu cele 5 KPI-uri (doar activele mari)
//  - cardul agregat „Proiecte mici" (finalizare 0–100 + câștig/pierdere), cu
//    lista proiectelor mici ascunsă sub un buton
//  - „Finalizate" ascunse sub un buton, ca să nu polueze pagina
import { useEffect, useMemo, useState } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import { setProjectsOrder } from '../data/mutations'
import {
  cashColor,
  costColor,
  marginColor,
  scheduleColor,
  type KpiColor,
} from '../domain/kpi'
import { compact, lei, num, pct } from '../lib/format'
import { Card, KpiPill, NeutralPill, ProgressBar, scheduleText } from '../components/ui'

const VALUE_COLOR: Record<KpiColor, string> = {
  good: 'text-[#46862A]',
  warning: 'text-[#F0A800]',
  error: 'text-[#D64545]',
}

function billingLabel(mode: string): string {
  return mode === 'lunara' ? 'Facturare lunară' : 'Facturare pe stadii fizice'
}

function ProjectCard({ p, onOpen }: { p: ProjectWithKpis; onOpen: () => void }) {
  const k = p.kpis
  const costOk = costColor(k.costVariance)
  return (
    <Card
      onClick={onOpen}
      className="space-y-4 transition-transform duration-150 hover:translate-x-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight">{p.name}</h2>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            {p.client ? `${p.client} · ` : ''}
            {billingLabel(p.billing_mode)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold">{lei(p.contract_value)}</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5B6673]">
            Valoare contract
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ProgressBar donePct={k.donePct} planPct={k.planPct} className="flex-1" />
        <span className="shrink-0 text-sm font-semibold">{pct(k.donePct)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <KpiPill color={scheduleColor(k.behindDays)}>{scheduleText(k.behindDays)}</KpiPill>
        <KpiPill color={costOk}>
          {costOk === 'good'
            ? `${compact(k.costVariance)} lei sub buget`
            : `${compact(-k.costVariance)} lei peste buget`}
        </KpiPill>
        <NeutralPill>Marjă {pct(k.margin)}</NeutralPill>
      </div>
    </Card>
  )
}

function CompanyKpiCard({
  eyebrow,
  question,
  value,
  caption,
  color,
}: {
  eyebrow: string
  question: string
  value: string
  caption: string
  color?: KpiColor
}) {
  return (
    <Card className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">{eyebrow}</p>
      <p className="text-sm text-[#5B6673]">{question}</p>
      <p className={`text-2xl font-semibold tracking-tight ${color ? VALUE_COLOR[color] : ''}`}>
        {value}
      </p>
      <p className="text-xs leading-relaxed text-[#5B6673]">{caption}</p>
    </Card>
  )
}

/** Banda cu cele 5 KPI-uri agregate pe proiectele active mari. */
function CompanyKpis({ projects }: { projects: ProjectWithKpis[] }) {
  const totalContract = projects.reduce((s, p) => s + Number(p.contract_value), 0)
  const totalEV = projects.reduce((s, p) => s + p.kpis.ev, 0)
  const totalCost = projects.reduce((s, p) => s + p.kpis.actualCost, 0)
  const totalCostVar = projects.reduce((s, p) => s + p.kpis.costVariance, 0)
  const shouldCost = totalCostVar + totalCost
  const totalFacturat = projects.reduce((s, p) => s + p.billing.facturat, 0)
  const totalIncasat = projects.reduce((s, p) => s + p.billing.incasat, 0)
  const totalWip = projects.reduce((s, p) => s + p.kpis.wip, 0)

  const progress = totalContract > 0 ? totalEV / totalContract : 0
  const marginTotal = totalEV > 0 ? (totalEV - totalCost) / totalEV : 0
  const cash = totalFacturat > 0 ? totalIncasat / totalFacturat : 1

  const behind = projects.filter((p) => p.kpis.behindDays >= 2)
  const graficValue =
    behind.length === 0
      ? 'toate conform planului'
      : behind.length === 1
        ? '1 proiect în urmă'
        : `${behind.length} proiecte în urmă`
  const graficCaption = projects
    .map((p) => {
      const first = p.name.split(' ')[0]
      const t = scheduleText(p.kpis.behindDays)
      return `${first} ${t.charAt(0).toLowerCase()}${t.slice(1)}`
    })
    .join(' · ')

  if (projects.length === 0) return null

  return (
    <div className="space-y-3 pt-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
        Companie · proiectele active
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <CompanyKpiCard
          eyebrow="01 · Progres"
          question="Cât s-a construit?"
          value={pct(progress)}
          caption={`lucrări executate ${compact(totalEV)} din ${compact(totalContract)} contracte`}
        />
        <CompanyKpiCard
          eyebrow="02 · Grafic"
          question="În avans sau în urmă?"
          value={graficValue}
          caption={graficCaption}
          color={behind.length === 0 ? 'good' : 'warning'}
        />
        <CompanyKpiCard
          eyebrow="03 · Cost vs buget"
          question="A costat cât am planificat?"
          value={`${totalCostVar >= 0 ? '+' : ''}${compact(totalCostVar)}`}
          caption={`atât ar fi trebuit să coste: ${compact(shouldCost)} · a costat: ${compact(totalCost)}`}
          color={costColor(totalCostVar)}
        />
        <CompanyKpiCard
          eyebrow="04 · Marjă la zi"
          question="Câștigăm bani?"
          value={pct(marginTotal)}
          caption={`clienții ne datorează ${compact(totalEV)} — costul nostru ${compact(totalCost)}`}
          color={marginColor(marginTotal)}
        />
        <CompanyKpiCard
          eyebrow="05 · Încasări"
          question="Unde sunt banii?"
          value={`${num(cash * 100, 0)}% încasat`}
          caption={`din ce am facturat · construit dar nefacturat: ${compact(totalWip)}`}
          color={cashColor(cash)}
        />
      </div>
    </div>
  )
}

/** Cardul agregat „Proiecte mici": finalizare 0–100 + câștig/pierdere pe total. */
function SmallProjects({
  projects,
  onOpen,
}: {
  projects: ProjectWithKpis[]
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (projects.length === 0) return null

  const value = projects.reduce((s, p) => s + Number(p.contract_value), 0)
  const ev = projects.reduce((s, p) => s + p.kpis.ev, 0)
  const cost = projects.reduce((s, p) => s + p.kpis.actualCost, 0)
  const completion = value > 0 ? ev / value : 0
  // plan agregat, ponderat cu valoarea (pentru liniuța neagră)
  const planWeighted =
    value > 0
      ? projects.reduce((s, p) => s + p.kpis.planPct * Number(p.contract_value), 0) / value
      : 0
  const result = ev - cost
  const margin = ev > 0 ? result / ev : 0

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Proiecte mici</h2>
        <span className="text-sm text-[#5B6673]">
          {projects.length === 1 ? 'un proiect' : `${projects.length} proiecte`} ·{' '}
          {lei(value)} în total
        </span>
      </div>

      <div className="flex items-center gap-3">
        <ProgressBar donePct={completion} planPct={planWeighted} className="flex-1" />
        <span className="shrink-0 text-sm font-semibold">{pct(completion)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <KpiPill color={result >= 0 ? 'good' : 'error'}>
          {result >= 0
            ? `+${compact(result)} lei câștigați`
            : `${compact(result)} lei pierduți`}
        </KpiPill>
        <NeutralPill>Marjă {pct(margin)}</NeutralPill>
        <NeutralPill>cost {compact(cost)} lei</NeutralPill>
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto rounded-full bg-[#EEECE7] px-4 py-1.5 text-sm font-medium hover:bg-[#E2DFD8]"
        >
          {open ? 'Ascunde lista' : `Arată proiectele mici (${projects.length})`}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-[#E8E8E8] pt-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} p={p} onOpen={() => onOpen(p.id)} />
          ))}
        </div>
      )}
    </Card>
  )
}

export function ProiecteView({
  projects,
  onOpen,
  onNew,
  onChanged,
}: {
  projects: ProjectWithKpis[]
  onOpen: (projectId: string) => void
  onNew: () => void
  onChanged: () => void
}) {
  const mainActive = useMemo(
    () => projects.filter((p) => p.active && !p.is_small),
    [projects]
  )
  const smallActive = useMemo(
    () => projects.filter((p) => p.active && p.is_small),
    [projects]
  )
  const doneProjects = useMemo(() => projects.filter((p) => !p.active), [projects])
  const totalContract = mainActive.reduce((s, p) => s + Number(p.contract_value), 0)

  const [showDone, setShowDone] = useState(false)

  // ── Drag & drop cu linie de inserție vizibilă ──
  // dragId = cardul ridicat; overId = cardul deasupra căruia planează (linia
  // verde apare deasupra lui); '__end__' = inserare la finalul listei.
  const [order, setOrder] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  useEffect(() => {
    setOrder(mainActive.map((p) => p.id))
  }, [mainActive])

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as ProjectWithKpis[]

  function drop() {
    if (dragId && overId) {
      setOrder((old) => {
        const next = old.filter((id) => id !== dragId)
        if (overId === '__end__') next.push(dragId)
        else next.splice(next.indexOf(overId), 0, dragId)
        // persistă noua ordine
        void setProjectsOrder([
          ...next,
          ...smallActive.map((p) => p.id),
          ...doneProjects.map((p) => p.id),
        ]).then(onChanged)
        return next
      })
    }
    setDragId(null)
    setOverId(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Proiecte</h1>
          <p className="mt-0.5 text-sm text-[#5B6673]">
            {mainActive.length === 1
              ? 'un proiect în derulare'
              : `${mainActive.length} proiecte în derulare`}{' '}
            · contracte semnate {lei(totalContract)} · trage cardurile ca să le ordonezi
          </p>
        </div>
        <button
          onClick={onNew}
          className="shrink-0 rounded-full bg-[#58A834] px-4 py-2 text-sm font-medium text-white hover:bg-[#46862A]"
        >
          + Proiect nou
        </button>
      </div>

      {mainActive.length === 0 && (
        <Card className="py-10 text-center">
          <p className="font-medium">Niciun proiect activ</p>
          <p className="mt-1 text-sm text-[#5B6673]">
            Apasă „+ Proiect nou" ca să configurezi primul proiect.
          </p>
        </Card>
      )}

      <div onDragOver={(e) => e.preventDefault()} onDrop={drop}>
        {ordered.map((p) => {
          const showLine = dragId !== null && overId === p.id && dragId !== p.id
          return (
            <div
              key={p.id}
              draggable
              onDragStart={() => setDragId(p.id)}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragId && dragId !== p.id) setOverId(p.id)
              }}
              onDragEnd={drop}
              className="relative pb-4"
            >
              {/* linia verde de inserție — arată exact unde va cădea cardul */}
              {showLine && (
                <div className="pointer-events-none absolute -top-2 left-0 right-0 z-10 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#58A834]" />
                  <span className="h-1 flex-1 rounded-full bg-[#58A834]" />
                </div>
              )}
              <div
                className={`flex items-stretch gap-2 transition-opacity ${
                  dragId === p.id ? 'opacity-40' : ''
                }`}
              >
                {/* mâner de tragere clar */}
                <div className="flex w-6 shrink-0 cursor-grab items-center justify-center rounded-xl text-[#C9C5BC] hover:bg-[#EEECE7] hover:text-[#5B6673] active:cursor-grabbing">
                  <span aria-hidden className="text-lg leading-none">⠿</span>
                </div>
                <div className="flex-1">
                  <ProjectCard p={p} onOpen={() => onOpen(p.id)} />
                </div>
              </div>
            </div>
          )
        })}
        {/* zonă de inserție la finalul listei */}
        {dragId !== null && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setOverId('__end__')
            }}
            className="relative h-8"
          >
            {overId === '__end__' && (
              <div className="pointer-events-none absolute top-0 left-0 right-0 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#58A834]" />
                <span className="h-1 flex-1 rounded-full bg-[#58A834]" />
              </div>
            )}
          </div>
        )}
      </div>

      <CompanyKpis projects={mainActive} />

      <SmallProjects projects={smallActive} onOpen={onOpen} />

      {doneProjects.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="rounded-full bg-[#EEECE7] px-4 py-2 text-sm font-medium hover:bg-[#E2DFD8]"
          >
            {showDone ? 'Ascunde finalizatele' : `Arată finalizatele (${doneProjects.length})`}
          </button>
          {showDone && (
            <div className="mt-3 space-y-3 opacity-70">
              {doneProjects.map((p) => (
                <ProjectCard key={p.id} p={p} onOpen={() => onOpen(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
