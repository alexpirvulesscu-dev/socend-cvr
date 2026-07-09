// Ecranul de detaliu Job: taskuri cu livrabile, buget vs cost real pe
// categorii și costurile înregistrate, cu formularul „Adaugă cost".
// Totul e editabil: jobul (nume/date/bugete), taskurile (nume/valoare/livrabile),
// se pot adăuga taskuri noi, costurile se pot șterge, iar taskurile finalizate
// se pot redeschide.
import { useState } from 'react'
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CostCategory,
  type JobWithKpis,
  type TaskRow,
} from '../data/projects'
import {
  addCostEntry,
  deleteCostEntry,
  duplicateJob,
  duplicateTask,
  setTaskStatus,
} from '../data/mutations'
import { useTaskManDays } from '../data/cronologic'
import { costColor, deliverablePct, scheduleColor, taskPct } from '../domain/kpi'
import { compact, dataRo, lei, num, pct } from '../lib/format'
import {
  BackLink,
  Card,
  DangerButton,
  KpiPill,
  NeutralPill,
  ProgressBar,
  StatusPill,
  scheduleText,
} from '../components/ui'
import { JobModal, TaskModal } from './modals'

const inputCls =
  'rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm outline-none focus:border-[#58A834]'

function DeliverableRowView({
  name,
  um,
  done,
  total,
  weight,
  targetPct,
}: {
  name: string
  um: string
  done: number
  total: number
  weight: number
  targetPct: number | null
}) {
  const p = deliverablePct(done, total)
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex-1 text-sm">
        {name}{' '}
        <span className="ml-1 inline-flex rounded-full bg-[#EEECE7] px-2 py-0.5 text-xs font-medium text-[#5B6673]">
          {num(weight)}%
        </span>
      </span>
      <ProgressBar donePct={p} planPct={targetPct ?? undefined} className="w-28 shrink-0" />
      <span className="w-28 shrink-0 text-right">
        <span className="block text-sm font-semibold">
          {num(done)} / {num(total)} {um}
        </span>
        <span className="block text-xs text-[#5B6673]">{pct(p, 0)}</span>
      </span>
    </div>
  )
}

function TaskCard({
  task,
  index,
  jobId,
  taskCount,
  consumedMd,
  onChanged,
}: {
  task: TaskRow
  index: number
  jobId: string
  taskCount: number
  consumedMd: number
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const pctDone = taskPct(
    task.deliverables.map((d) => ({
      qtyTotal: Number(d.qty_total),
      qtyDone: Number(d.qty_done),
      weight: Number(d.weight),
    }))
  )
  // Ținta de efort: oamenii-zile se planifică PE LIVRABIL; planul taskului e
  // suma lor (cu fallback pe vechiul câmp de la nivel de task). Efortul consumat
  // vine din Pontaj la nivel de task (nu se poate împărți pe livrabil), deci
  // linia-țintă (efort consumat / plan) e aceeași pe fiecare bară de livrabil.
  const deliverablesMd = task.deliverables.reduce(
    (s, d) => s + (d.planned_man_days == null ? 0 : Number(d.planned_man_days)),
    0
  )
  const plannedMd =
    deliverablesMd > 0
      ? deliverablesMd
      : task.planned_man_days == null
        ? null
        : Number(task.planned_man_days)
  const effortPct = plannedMd && plannedMd > 0 ? consumedMd / plannedMd : null
  const targetLine = effortPct === null ? null : Math.min(effortPct, 1)
  const effortBehind = effortPct !== null && effortPct > pctDone + 0.02

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
        <h4 className="font-semibold leading-tight">
          <span className="mr-1 text-[#5B6673]">{String(index + 1).padStart(2, '0')} ·</span>{' '}
          {task.name}
        </h4>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill status={task.status} />
          <span className="text-sm font-semibold">{lei(task.value)}</span>
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
            targetPct={targetLine}
          />
        ))}
      </div>

      <p className="text-sm text-[#5B6673]">
        <strong className="text-[#0D1A2D]">{pct(pctDone)}</strong> din valoarea taskului realizată
      </p>

      {/* Ținta de efort (oameni-zile): bara = progres fizic, liniuța = efort consumat */}
      {plannedMd !== null && plannedMd > 0 && (
        <div className="rounded-2xl bg-[#FAF9F6] p-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-[#5B6673]">
              Efort: <strong className="text-[#0D1A2D]">{num(consumedMd)}</strong> din{' '}
              {num(plannedMd)} oameni-zile
            </span>
            <span className={`font-medium ${effortBehind ? 'text-[#D64545]' : 'text-[#46862A]'}`}>
              {effortBehind ? 'sub randament' : 'în ritm'}
            </span>
          </div>
          <ProgressBar donePct={pctDone} planPct={Math.min(effortPct ?? 0, 1)} className="mt-2" />
          <p className="mt-1 text-xs text-[#5B6673]">
            bara = progres fizic · liniuța = efort consumat ({pct(effortPct ?? 0, 0)})
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
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
        {task.status === 'finalizat' && (
          <button
            disabled={busy}
            onClick={() => changeStatus('in_lucru')}
            className="rounded-full bg-[#EEECE7] px-4 py-2 text-sm font-medium hover:bg-[#E2DFD8] disabled:opacity-50"
          >
            Redeschide taskul
          </button>
        )}
        <button
          onClick={() => setEditing(true)}
          className="rounded-full border border-[#E8E8E8] bg-white px-4 py-2 text-sm font-medium text-[#5B6673] hover:border-[#58A834] hover:text-[#0D1A2D]"
        >
          Editează
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await duplicateTask(jobId, task, taskCount + 1)
              onChanged()
            } finally {
              setBusy(false)
            }
          }}
          className="rounded-full border border-[#E8E8E8] bg-white px-4 py-2 text-sm font-medium text-[#5B6673] hover:border-[#58A834] hover:text-[#0D1A2D] disabled:opacity-50"
        >
          Duplică
        </button>
      </div>

      {editing && (
        <TaskModal
          jobId={task.id /* nefolosit la editare */}
          task={task}
          sortOrder={index + 1}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onDeleted={() => {
            setEditing(false)
            onChanged()
          }}
        />
      )}
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

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 border-t border-[#E8E8E8] pt-4">
      <h4 className="text-sm font-semibold">Adaugă cost</h4>
      <div className="grid grid-cols-2 gap-3">
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
          className={inputCls}
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
  projectId,
  projectName,
  jobsCount,
  onBack,
  onChanged,
  onCronologic,
  onJobDeleted,
}: {
  job: JobWithKpis
  projectId: string
  projectName: string
  jobsCount: number
  onBack: () => void
  onChanged: () => void
  onCronologic: () => void
  onJobDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const manDays = useTaskManDays(job.tasks.map((t) => t.id))
  const k = job.kpis
  const costOk = costColor(k.costVariance)
  const inLucru = job.tasks.filter((t) => t.status === 'in_lucru').length
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <BackLink label={projectName} onClick={onBack} />

      {editing && (
        <JobModal
          projectId={projectId}
          job={job}
          sortOrder={0}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onDeleted={onJobDeleted}
        />
      )}
      {addingTask && (
        <TaskModal
          jobId={job.id}
          sortOrder={job.tasks.length + 1}
          onClose={() => setAddingTask(false)}
          onSaved={() => {
            setAddingTask(false)
            onChanged()
          }}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{job.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="rounded-full border border-[#E8E8E8] bg-white px-4 py-1.5 text-sm font-medium hover:border-[#58A834]"
          >
            Editează
          </button>
          <button
            onClick={onCronologic}
            className="rounded-full border border-[#E8E8E8] bg-white px-4 py-1.5 text-sm font-medium hover:border-[#58A834]"
          >
            Vedere cronologică
          </button>
          <button
            disabled={duplicating}
            onClick={async () => {
              setDuplicating(true)
              try {
                await duplicateJob(
                  projectId,
                  {
                    name: job.name,
                    start_date: job.start_date,
                    end_date: job.end_date,
                    tasks: job.tasks,
                    budgets: job.budgetByCategory,
                  },
                  jobsCount + 1
                )
                // înapoi la proiect, ca să vezi copia lângă original
                onChanged()
                onBack()
              } finally {
                setDuplicating(false)
              }
            }}
            className="rounded-full border border-[#E8E8E8] bg-white px-4 py-1.5 text-sm font-medium hover:border-[#58A834] disabled:opacity-50"
          >
            {duplicating ? 'Se duplică…' : 'Duplică jobul'}
          </button>
          <KpiPill color={scheduleColor(k.behindDays)}>{scheduleText(k.behindDays)}</KpiPill>
          <KpiPill color={costOk}>
            {costOk === 'good'
              ? `${compact(k.costVariance)} lei sub buget`
              : `${compact(-k.costVariance)} lei peste buget`}
          </KpiPill>
          <NeutralPill>
            {inLucru === 0
              ? 'niciun task în lucru'
              : inLucru === 1
                ? 'un task în lucru'
                : `${inLucru} taskuri în lucru`}
          </NeutralPill>
        </div>
      </div>
      <p className="text-sm text-[#5B6673]">
        {dataRo(job.start_date)} – {dataRo(job.end_date)} · Valoare {lei(k.value)}
      </p>

      <div className="flex items-center gap-3">
        <ProgressBar donePct={k.donePct} planPct={k.planPct} className="flex-1" />
        <span className="shrink-0 text-sm font-semibold">{pct(k.donePct)}</span>
      </div>

      {/* Pe ecrane late: taskurile pe stânga, banii (buget + costuri) pe dreapta */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[1fr_400px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between pt-2">
            <h3 className="text-base font-semibold">Taskuri</h3>
            <button
              onClick={() => setAddingTask(true)}
              className="rounded-full bg-[#DDEDDC] px-4 py-1.5 text-sm font-medium text-[#46862A] hover:bg-[#CBE3C9]"
            >
              + Adaugă task
            </button>
          </div>
          {job.tasks.length === 0 && (
            <Card>
              <p className="text-sm text-[#5B6673]">
                Jobul nu are încă taskuri. Apasă „+ Adaugă task" ca să definești primul.
              </p>
            </Card>
          )}
          {job.tasks.map((t, i) => (
            <TaskCard
              key={t.id}
              task={t}
              index={i}
              jobId={job.id}
              taskCount={job.tasks.length}
              consumedMd={manDays[t.id] ?? 0}
              onChanged={onChanged}
            />
          ))}
        </div>

        <div className="space-y-4 xl:sticky xl:top-16">
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
                      <span className="w-28 shrink-0">{COST_CATEGORY_LABELS[c.category]}</span>
                      <span className="flex-1 truncate text-[#5B6673]">{c.description}</span>
                      <span className="shrink-0 font-medium">{lei(Number(c.amount))}</span>
                      <DangerButton
                        label="✕"
                        armedLabel="Sigur?"
                        onConfirmed={async () => {
                          await deleteCostEntry(c.id)
                          onChanged()
                        }}
                      />
                    </div>
                  ))}
              </div>
            )}
            <AdaugaCost jobId={job.id} onAdded={onChanged} />
          </Card>
        </div>
      </div>
    </div>
  )
}
