// Ecranul de detaliu Proiect: cele 5 KPI-uri (fiecare răspunde la o întrebare
// simplă), fluxul de facturare, lista de joburi și panoul „Cum se calculează".
import type { ProjectWithKpis } from '../data/projects'
import {
  cashColor,
  costColor,
  marginColor,
  scheduleColor,
  type KpiColor,
} from '../domain/kpi'
import { lei, pct, zile } from '../lib/format'
import { BackLink, Card, KpiPill, ProgressBar, scheduleText } from '../components/ui'

const KPI_VALUE_COLOR: Record<KpiColor, string> = {
  good: 'text-[#46862A]',
  warning: 'text-[#A87400]',
  error: 'text-[#B23A3A]',
}

function KpiCard({
  question,
  value,
  caption,
  color,
}: {
  question: string
  value: string
  caption: string
  color?: KpiColor
}) {
  return (
    <Card className="space-y-1">
      <p className="text-sm text-[#5B6673]">{question}</p>
      <p className={`text-2xl font-semibold tracking-tight ${color ? KPI_VALUE_COLOR[color] : ''}`}>
        {value}
      </p>
      <p className="text-xs text-[#5B6673]">{caption}</p>
    </Card>
  )
}

/** Fluxul de facturare: Depus → Certificat → Facturat → Încasat. */
function FluxFacturare({ p }: { p: ProjectWithKpis }) {
  const b = p.billing
  const steps = [
    { label: 'Depus', value: b.depus, caption: 'situații depuse' },
    { label: 'Certificat', value: b.certificat, caption: 'acceptat de client' },
    { label: 'Facturat', value: b.facturat, caption: 'facturi emise' },
    { label: 'Încasat', value: b.incasat, caption: 'bani în cont' },
  ]
  return (
    <Card>
      <h3 className="mb-4 text-base font-semibold">Flux facturare</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.label} className="relative">
            <p className="text-xs font-medium uppercase tracking-wide text-[#5B6673]">
              {i > 0 && <span aria-hidden className="mr-1 text-[#C9C5BC]">→</span>}
              {s.label}
            </p>
            <p className="mt-1 font-semibold">{lei(s.value)}</p>
            <p className="text-xs text-[#5B6673]">{s.caption}</p>
          </div>
        ))}
      </div>
      {p.kpis.wip > 0 && (
        <p className="mt-4 border-t border-[#E8E8E8] pt-3 text-sm text-[#5B6673]">
          Lucrări executate și încă nedepuse (WIP):{' '}
          <strong className="text-[#0D1A2D]">{lei(Math.round(p.kpis.wip))}</strong>
        </p>
      )}
    </Card>
  )
}

function CumSeCalculeaza() {
  const rows = [
    ['Lucrări executate', 'valoarea taskului × procentul realizat din livrabile, adunat pe tot proiectul'],
    ['Grafic', '(procent planificat azi − procent realizat) × durata jobului, în zile; media pe proiect e ponderată cu valoarea joburilor'],
    ['Cost', 'bugetul câștigat (buget × procent realizat) minus costurile reale; plus = sub buget'],
    ['Marjă', '(lucrări executate − costuri reale) ÷ lucrări executate'],
    ['Cash', 'încasat ÷ facturat; WIP = lucrări executate care nu au fost încă depuse la decontare'],
  ]
  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">Cum se calculează</h3>
      <dl className="space-y-2">
        {rows.map(([term, def]) => (
          <div key={term} className="text-sm">
            <dt className="inline font-medium">{term}:</dt>{' '}
            <dd className="inline text-[#5B6673]">{def}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

export function ProiectView({
  project: p,
  onBack,
  onOpenJob,
}: {
  project: ProjectWithKpis
  onBack: () => void
  onOpenJob: (jobId: string) => void
}) {
  const k = p.kpis
  const schedColor = scheduleColor(k.behindDays)
  const cColor = costColor(k.costVariance)

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <BackLink label="Proiecte" onClick={onBack} />

      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold leading-tight">{p.name}</h1>
        <span className="shrink-0 text-sm text-[#5B6673]">{p.client}</span>
      </div>
      <p className="text-sm text-[#5B6673]">
        Contract {lei(p.contract_value)} ·{' '}
        {p.billing_mode === 'lunara' ? 'facturare lunară' : 'facturare pe stadii fizice'}
      </p>

      {/* Cele 5 KPI-uri */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          question="Cât am construit?"
          value={lei(Math.round(k.ev))}
          caption={`${pct(k.donePct)} din contractul de ${lei(p.contract_value)}`}
        />
        <KpiCard
          question="Suntem în grafic?"
          value={
            k.behindDays >= 0.5
              ? `−${zile(k.behindDays)}`
              : k.behindDays <= -0.5
                ? `+${zile(k.behindDays)}`
                : 'în grafic'
          }
          caption={
            k.behindDays >= 0.5
              ? 'în urma planului, la valoarea lucrărilor'
              : 'față de planul la zi'
          }
          color={schedColor}
        />
        <KpiCard
          question="Ne încadrăm în buget?"
          value={`${k.costVariance >= 0 ? '+' : '−'}${lei(Math.round(Math.abs(k.costVariance)))}`}
          caption={k.costVariance >= 0 ? 'sub bugetul câștigat' : 'peste bugetul câștigat'}
          color={cColor}
        />
        <KpiCard
          question="Câștigăm bani?"
          value={pct(k.margin)}
          caption="marjă pe lucrările executate"
          color={marginColor(k.margin)}
        />
        <KpiCard
          question="Ne intră banii?"
          value={pct(k.cashPct)}
          caption="încasat din ce am facturat"
          color={cashColor(k.cashPct)}
        />
      </div>

      <FluxFacturare p={p} />

      {/* Joburi */}
      <Card>
        <h3 className="mb-4 text-base font-semibold">Joburi</h3>
        <div className="divide-y divide-[#E8E8E8]">
          {p.jobs.map((j) => {
            const jk = j.kpis
            return (
              <button
                key={j.id}
                onClick={() => onOpenJob(j.id)}
                className="block w-full py-3 text-left first:pt-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{j.name}</span>
                  <KpiPill color={scheduleColor(jk.behindDays)}>{scheduleText(jk.behindDays)}</KpiPill>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressBar donePct={jk.donePct} planPct={jk.planPct} className="flex-1" />
                  <span className="w-32 shrink-0 text-right text-sm text-[#5B6673]">
                    {pct(jk.donePct)} · {lei(jk.value)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      <CumSeCalculeaza />
    </div>
  )
}
