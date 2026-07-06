// Ecranul de detaliu Job: taskuri cu livrabile, buget vs cost real pe
// categorii și costurile înregistrate, cu formularul „Adaugă cost".
import { useState } from 'react'
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CostCategory,
  type JobWithKpis,
  type TaskRow,
} from '../data/projects'
import { addCostEntry, setTaskStatus } from '../data/mutations'
import { deliverablePct, scheduleColor, taskPct } from '../domain/kpi'
import { dataRo, lei, num, pct } from '../lib/format'
import { BackLink, Card, KpiPill, ProgressBar, StatusPill, scheduleText } from '../components/ui'

function DeliverableRowView({
  name,
  um,
  done,
  total,
  weight,
}: {
  name: string
  um: string
  done: number
  total: number
  weight: number
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-14 shrink-0">
        <span className="inline-flex rounded-full bg-[#EEECE7] px-2 py-0.5 text-xs font-medium text-[#5B6673]">
          {num(weight)}%
        </span>
      </span>
      <span className="flex-1 text-sm">{name}</span>
      <ProgressBar donePct={deliverablePct(done, total)} className="w-24 shrink-0" />
      <span className="w-28 shrink-0 text-right text-sm text-[#5B6673]">
        {num(done)} / {num(total)} {um}
      </span>
    </div>
  )
}

function TaskCard({ task, onChanged }: { task: TaskRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const pctDone = taskPct(
    task.deliverables.map((d) => ({
      qtyTotal: Number(d.qty_total),
      qtyDone: Number(d.qty_done),
      weight: Number(d.weight),
    }))
  )

  async function changeStatus(status: 'in_lucru' | 'finalizat') {
    setBusy(true)
    try {
      await setTaskStatus(task.id, status)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium leading-tight">{task.name}</h4>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm text-[#5B6673]">{lei(task.value)}</span>
          <StatusPill status={task.status} />
        </div>
      </div>

      <div className="divide-y divide-[#F3F1EC]">
        {task.deliverables.map((d) => (
          <DeliverableRowView
            key={d.id}
            name={d.name}
            um={d.um}
            done={Number(d.qty_done)}
            total={Number(d.qty_total)}
            weight={Number(d.weight)}
          />
        ))}
      </div>

      <p className="text-sm text-[#5B6673]">
        <strong className="text-[#0D1A2D]">{pct(pctDone)}</strong> din valoarea taskului realizată
      </p>

      <div className="flex gap-2">
        {task.status === 'neinceput' && (
          <button
            disabled={busy}
            onClick={() => changeStatus('in_lucru')}
            className="rounded-full bg-[#58A834] px-4 py-2 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-50"
          >
            Pornește taskul
          </button>
        )}
        {task.status === 'in_lucru' && (
          <button
            disabled={busy}
            onClick={() => changeStatus('finalizat')}
            className="rounded-full bg-[#DDEDDC] px-4 py-2 text-sm font-medium text-[#46862A] hover:bg-[#CBE3C9] disabled:opacity-50"
          >
            Marchează finalizat
          </button>
        )}
      </div>
    </Card>
  )
}

/** Buget vs cost real pe cele 5 categorii; depășirile apar cu roșu. */
function BugetVsCost({ job }: { job: JobWithKpis }) {
  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">Buget vs cost real</h3>
      <div className="divide-y divide-[#F3F1EC]">
        {COST_CATEGORIES.map((cat) => {
          const budget = job.budgetByCategory[cat]
          const cost = job.costByCategory[cat]
          const over = cost > budget
          return (
            <div key={cat} className="flex items-center justify-between py-2 text-sm">
              <span>{COST_CATEGORY_LABELS[cat]}</span>
              <span className={over ? 'font-medium text-[#D64545]' : 'text-[#5B6673]'}>
                {lei(cost)} <span className="text-[#C9C5BC]">/</span> {lei(budget)}
              </span>
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[#E8E8E8] pt-3 text-sm font-medium">
        <span>Total</span>
        <span className={job.kpis.actualCost > job.kpis.budgetTotal ? 'text-[#D64545]' : ''}>
          {lei(job.kpis.actualCost)} <span className="font-normal text-[#C9C5BC]">/</span>{' '}
          {lei(job.kpis.budgetTotal)}
        </span>
      </div>
    </Card>
  )
}

function AdaugaCost({ jobId, onAdded }: { jobId: string; onAdded: () => void }) {
  const [category, setCategory] = useState<CostCategory>('manopera')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(amount.replace(',', '.'))
    if (!value || value <= 0) {
      setError('Introdu o sumă mai mare ca 0.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addCostEntry(jobId, { category, amount: value, description, entryDate })
      setAmount('')
      setDescription('')
      onAdded()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls =
    'rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm outline-none focus:border-[#58A834]'

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-[#E8E8E8] pt-4">
      <h4 className="text-sm font-semibold">Adaugă cost</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as CostCategory)}
          className={inputCls}
          aria-label="Categorie"
        >
          {COST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {COST_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Suma (lei)"
          inputMode="decimal"
          className={inputCls}
          aria-label="Suma în lei"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descriere"
          className={`${inputCls} col-span-2 sm:col-span-1`}
          aria-label="Descriere"
        />
        <input
          type="date"
          value={entryDate}
          onChange={(e) => setEntryDate(e.target.value)}
          className={inputCls}
          aria-label="Data"
        />
      </div>
      {error && <p className="text-sm text-[#D64545]">{error}</p>}
      <button
        disabled={busy}
        className="rounded-full bg-[#58A834] px-4 py-2 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-50"
      >
        {busy ? 'Se salvează…' : 'Salvează costul'}
      </button>
    </form>
  )
}

export function JobView({
  job,
  projectName,
  onBack,
  onChanged,
}: {
  job: JobWithKpis
  projectName: string
  onBack: () => void
  onChanged: () => void
}) {
  const k = job.kpis
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <BackLink label={projectName} onClick={onBack} />

      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">{job.name}</h1>
        <span className="text-sm text-[#5B6673]">
          {dataRo(job.start_date)} → {dataRo(job.end_date)}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <ProgressBar donePct={k.donePct} planPct={k.planPct} className="flex-1" />
        <span className="shrink-0 text-sm text-[#5B6673]">
          {pct(k.donePct)} din {lei(k.value)}
        </span>
        <KpiPill color={scheduleColor(k.behindDays)}>{scheduleText(k.behindDays)}</KpiPill>
      </div>

      <h3 className="pt-2 text-base font-semibold">Taskuri</h3>
      <div className="space-y-3">
        {job.tasks.map((t) => (
          <TaskCard key={t.id} task={t} onChanged={onChanged} />
        ))}
      </div>

      <BugetVsCost job={job} />

      <Card>
        <h3 className="mb-3 text-base font-semibold">Costuri înregistrate</h3>
        {job.cvr_cost_entries.length === 0 ? (
          <p className="text-sm text-[#5B6673]">Niciun cost înregistrat încă.</p>
        ) : (
          <div className="divide-y divide-[#F3F1EC]">
            {[...job.cvr_cost_entries]
              .sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-[#5B6673]">{dataRo(c.entry_date)}</span>
                  <span className="w-32 shrink-0">{COST_CATEGORY_LABELS[c.category]}</span>
                  <span className="flex-1 truncate text-[#5B6673]">{c.description}</span>
                  <span className="shrink-0 font-medium">{lei(Number(c.amount))}</span>
                </div>
              ))}
          </div>
        )}
        <AdaugaCost jobId={job.id} onAdded={onChanged} />
      </Card>
    </div>
  )
}
