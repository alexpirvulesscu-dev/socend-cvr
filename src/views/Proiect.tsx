// Ecranul de detaliu Proiect, 1:1 după design:
//  - cele 5 KPI-uri cu întrebările exacte din design (01 · Progres ... 05 · Încasări)
//  - „Flux facturare client": Executat → Aprobat → Facturat → Încasat
//  - joburile ca și carduri separate, clicabile, cu reacție la hover
//  - „Editează": date proiect + facturare + finalizare + ștergere (sincron cu P&L)
import { useState } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import {
  deleteProject,
  setProjectActive,
  updateBilling,
  updateProject,
} from '../data/mutations'
import {
  cashColor,
  costColor,
  marginColor,
  scheduleColor,
  type KpiColor,
} from '../domain/kpi'
import { compact, dataRo, lei, num, pct } from '../lib/format'
import {
  BackLink,
  Card,
  DangerButton,
  KpiPill,
  Modal,
  NeutralPill,
  ProgressBar,
  scheduleText,
} from '../components/ui'
import { JobModal } from './modals'

const inputCls =
  'w-full rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm outline-none focus:border-[#58A834]'
const labelCls = 'mb-1 block text-xs font-medium text-[#5B6673]'

/** Modalul de editare: informații proiect, flux de facturare, finalizare, ștergere. */
function ProjectEditModal({
  p,
  onClose,
  onSaved,
  onDeleted,
}: {
  p: ProjectWithKpis
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(p.name)
  const [client, setClient] = useState(p.client ?? '')
  const [billingMode, setBillingMode] = useState<'stadii_fizice' | 'lunara'>(
    p.billing_mode === 'lunara' ? 'lunara' : 'stadii_fizice'
  )
  const [startDate, setStartDate] = useState(p.start_date ?? '')
  const [endDate, setEndDate] = useState(p.end_date ?? '')
  const [depus, setDepus] = useState(String(p.billing.depus))
  const [certificat, setCertificat] = useState(String(p.billing.certificat))
  const [facturat, setFacturat] = useState(String(p.billing.facturat))
  const [incasat, setIncasat] = useState(String(p.billing.incasat))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toNum = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0

  async function run(action: () => Promise<void>, after: () => void) {
    setBusy(true)
    setError(null)
    try {
      await action()
      after()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Editează proiectul" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Nume proiect</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Client / beneficiar</label>
            <input className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Facturare</label>
            <select
              className={inputCls}
              value={billingMode}
              onChange={(e) => setBillingMode(e.target.value as 'stadii_fizice' | 'lunara')}
            >
              <option value="stadii_fizice">Pe stadii fizice</option>
              <option value="lunara">Lunară</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Început</label>
              <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Sfârșit</label>
              <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Flux facturare client (lei)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Executat</label>
              <input className={inputCls} inputMode="decimal" value={depus} onChange={(e) => setDepus(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Aprobat</label>
              <input className={inputCls} inputMode="decimal" value={certificat} onChange={(e) => setCertificat(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Facturat</label>
              <input className={inputCls} inputMode="decimal" value={facturat} onChange={(e) => setFacturat(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Încasat</label>
              <input className={inputCls} inputMode="decimal" value={incasat} onChange={(e) => setIncasat(e.target.value)} />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-[#D64545]">Eroare: {error}</p>}

        <div className="flex items-center justify-between border-t border-[#E8E8E8] pt-4">
          <button
            disabled={busy}
            onClick={() =>
              run(async () => {
                await updateProject(p.id, p.pnl_proiect_id, {
                  name: name.trim(),
                  client: client.trim(),
                  billingMode,
                  startDate,
                  endDate,
                })
                await updateBilling(p.id, {
                  depus: toNum(depus),
                  certificat: toNum(certificat),
                  facturat: toNum(facturat),
                  incasat: toNum(incasat),
                })
              }, onSaved)
            }
            className="rounded-full bg-[#58A834] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
          >
            {busy ? 'Se salvează…' : 'Salvează modificările'}
          </button>
          <div className="flex items-center gap-2">
            <button
              disabled={busy}
              onClick={() => run(() => setProjectActive(p.id, p.pnl_proiect_id, !p.active), onSaved)}
              className="rounded-full bg-[#EEECE7] px-4 py-2 text-sm font-medium hover:bg-[#E2DFD8] disabled:opacity-40"
            >
              {p.active ? 'Marchează finalizat' : 'Reactivează proiectul'}
            </button>
            <DangerButton
              label="Șterge proiectul"
              onConfirmed={() => run(() => deleteProject(p.id, p.pnl_proiect_id), onDeleted)}
            />
          </div>
        </div>
        <p className="text-xs text-[#5B6673]">
          Ștergerea elimină definitiv proiectul din CVR (joburi, taskuri, raportări, costuri).
          În P&L, proiectul legat doar se dezactivează — istoricul de plăți rămâne.
        </p>
      </div>
    </Modal>
  )
}

const VALUE_COLOR: Record<KpiColor, string> = {
  good: 'text-[#46862A]',
  warning: 'text-[#F0A800]',
  error: 'text-[#D64545]',
}

function KpiCard({
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

/** Fluxul de facturare, ca în design: Executat → Aprobat → Facturat → Încasat. */
function FluxFacturare({ p }: { p: ProjectWithKpis }) {
  const b = p.billing
  const steps = [
    { label: 'Executat', value: b.depus },
    { label: 'Aprobat', value: b.certificat },
    { label: 'Facturat', value: b.facturat },
    { label: 'Încasat', value: b.incasat, highlight: true },
  ]
  return (
    <Card>
      <h3 className="mb-4 text-base font-semibold">Flux facturare client</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-start gap-2">
            {i > 0 && (
              <span aria-hidden className="mt-1 hidden text-[#C9C5BC] sm:block">
                →
              </span>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
                {s.label}
              </p>
              <p
                className={`mt-1 text-lg font-semibold tracking-tight ${
                  s.highlight ? 'text-[#F0A800]' : ''
                }`}
              >
                {lei(s.value)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {p.kpis.wip > 0 && (
        <p className="mt-4 border-t border-[#E8E8E8] pt-3 text-sm text-[#5B6673]">
          Construit dar nefacturat (WIP):{' '}
          <strong className="text-[#0D1A2D]">{lei(Math.round(p.kpis.wip))}</strong>
        </p>
      )}
    </Card>
  )
}

function CumSeCalculeaza() {
  const rows = [
    ['Progres', 'valoarea taskului × procentul realizat din livrabile, adunat pe tot proiectul'],
    ['Grafic', '(procent planificat azi − procent realizat) × durata jobului, în zile; media pe proiect e ponderată cu valoarea joburilor'],
    ['Cost vs buget', 'bugetul câștigat (buget × procent realizat) minus costurile reale; plus = sub buget'],
    ['Marjă la zi', '(lucrări executate − costuri reale) ÷ lucrări executate'],
    ['Încasări', 'încasat ÷ facturat; WIP = lucrări executate care nu au fost încă facturate'],
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
  onChanged,
  onDeleted,
}: {
  project: ProjectWithKpis
  onBack: () => void
  onOpenJob: (jobId: string) => void
  onChanged: () => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [addingJob, setAddingJob] = useState(false)
  const k = p.kpis
  const shouldCost = k.costVariance + k.actualCost

  const behindJobs = p.jobs.filter((j) => j.kpis.behindDays >= 2)
  const graficCaption =
    behindJobs.length === 0
      ? 'toate joburile conform planului'
      : `${behindJobs.map((j) => j.name.match(/\(([^)]+)\)/)?.[1] ?? j.name).join(', ')} în urmă · restul conform planului`

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <BackLink label="Proiecte" onClick={onBack} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold leading-tight">{p.name}</h1>
          {!p.active && <NeutralPill>Finalizat</NeutralPill>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-full border border-[#E8E8E8] bg-white px-4 py-1.5 text-sm font-medium hover:border-[#58A834]"
          >
            Editează
          </button>
          <span className="shrink-0 text-sm text-[#5B6673]">{p.client}</span>
        </div>
      </div>
      <p className="text-sm text-[#5B6673]">
        Contract {lei(p.contract_value)} ·{' '}
        {p.billing_mode === 'lunara' ? 'facturare lunară' : 'facturare pe stadii fizice'}
      </p>

      {editing && (
        <ProjectEditModal
          p={p}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onDeleted={onDeleted}
        />
      )}

      {/* Cele 5 KPI-uri — întrebările exacte din design, pe UN rând pe ecrane late */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          eyebrow="01 · Progres"
          question="Cât s-a construit?"
          value={pct(k.donePct)}
          caption={`lucrări executate ${compact(k.ev)} din ${compact(p.contract_value)} contract`}
        />
        <KpiCard
          eyebrow="02 · Grafic"
          question="În avans sau în urmă?"
          value={scheduleText(k.behindDays)}
          caption={graficCaption}
          color={scheduleColor(k.behindDays)}
        />
        <KpiCard
          eyebrow="03 · Cost vs buget"
          question="A costat cât am planificat?"
          value={`${k.costVariance >= 0 ? '+' : ''}${compact(k.costVariance)}`}
          caption={`atât ar fi trebuit să coste: ${compact(shouldCost)} · a costat: ${compact(k.actualCost)}`}
          color={costColor(k.costVariance)}
        />
        <KpiCard
          eyebrow="04 · Marjă la zi"
          question="Câștigăm bani?"
          value={pct(k.margin)}
          caption={`clienții ne datorează ${compact(k.ev)} — costul nostru ${compact(k.actualCost)}`}
          color={marginColor(k.margin)}
        />
        <KpiCard
          eyebrow="05 · Încasări"
          question="Unde sunt banii?"
          value={`${num(k.cashPct * 100, 0)}% încasat`}
          caption={`din ce am facturat · construit dar nefacturat: ${compact(k.wip)}`}
          color={cashColor(k.cashPct)}
        />
      </div>

      <FluxFacturare p={p} />

      {/* Joburi — carduri separate, clicabile, cu reacție la hover (ca în design) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Joburi</h3>
          <button
            onClick={() => setAddingJob(true)}
            className="rounded-full bg-[#DDEDDC] px-4 py-1.5 text-sm font-medium text-[#46862A] hover:bg-[#CBE3C9]"
          >
            + Adaugă job
          </button>
        </div>
        {addingJob && (
          <JobModal
            projectId={p.id}
            sortOrder={p.jobs.length + 1}
            onClose={() => setAddingJob(false)}
            onSaved={() => {
              setAddingJob(false)
              onChanged()
            }}
          />
        )}
        {p.jobs.length === 0 && (
          <Card>
            <p className="text-sm text-[#5B6673]">
              Proiectul nu are încă joburi. Apasă „+ Adaugă job" ca să definești primul.
            </p>
          </Card>
        )}
        {p.jobs.map((j) => {
          const jk = j.kpis
          const inLucru = j.tasks.filter((t) => t.status === 'in_lucru').length
          return (
            <Card
              key={j.id}
              onClick={() => onOpenJob(j.id)}
              className="transition-transform duration-150 hover:translate-x-0.5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold leading-tight">{j.name}</h4>
                  <p className="mt-0.5 text-sm text-[#5B6673]">
                    {dataRo(j.start_date)} – {dataRo(j.end_date)} · {lei(jk.value)}
                  </p>
                </div>
                <span aria-hidden className="shrink-0 text-lg text-[#C9C5BC]">
                  ›
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <ProgressBar donePct={jk.donePct} planPct={jk.planPct} className="flex-1" />
                <span className="w-12 shrink-0 text-right text-sm font-semibold">
                  {pct(jk.donePct, 0)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <KpiPill color={scheduleColor(jk.behindDays)}>{scheduleText(jk.behindDays)}</KpiPill>
                <NeutralPill>
                  {inLucru === 0
                    ? 'niciun task în lucru'
                    : inLucru === 1
                      ? 'un task în lucru'
                      : `${inLucru} taskuri în lucru`}
                </NeutralPill>
              </div>
            </Card>
          )
        })}
      </div>

      <CumSeCalculeaza />
    </div>
  )
}
