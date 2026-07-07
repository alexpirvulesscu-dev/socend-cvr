// Ecranul de detaliu Job: taskuri cu livrabile, buget vs cost real pe
// categorii și costurile înregistrate, cu formularul „Adaugă cost".
// Totul e editabil: jobul (nume/date/bugete), taskurile (nume/valoare/livrabile),
// costurile se pot șterge, iar taskurile finalizate se pot redeschide.
import { useState } from 'react'
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CostCategory,
  type DeliverableRow,
  type JobWithKpis,
  type TaskRow,
} from '../data/projects'
import {
  addCostEntry,
  addDeliverable,
  deleteCostEntry,
  deleteDeliverable,
  deleteJob,
  deleteTask,
  setTaskStatus,
  updateDeliverable,
  updateJob,
  updateTask,
} from '../data/mutations'
import { costColor, deliverablePct, scheduleColor, taskPct } from '../domain/kpi'
import { compact, dataRo, lei, num, pct } from '../lib/format'
import {
  BackLink,
  Card,
  DangerButton,
  KpiPill,
  Modal,
  NeutralPill,
  ProgressBar,
  StatusPill,
  scheduleText,
} from '../components/ui'

const inputCls =
  'w-full rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm outline-none focus:border-[#58A834]'
const labelCls = 'mb-1 block text-xs font-medium text-[#5B6673]'

function toNum(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.')) || 0
}

/** Modalul de editare al jobului: nume, date, bugetele pe 5 categorii, ștergere. */
function JobEditModal({
  job,
  onClose,
  onSaved,
  onDeleted,
}: {
  job: JobWithKpis
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(job.name)
  const [startDate, setStartDate] = useState(job.start_date)
  const [endDate, setEndDate] = useState(job.end_date)
  const [budgets, setBudgets] = useState<Record<CostCategory, string>>(
    Object.fromEntries(
      COST_CATEGORIES.map((c) => [c, String(job.budgetByCategory[c] ?? 0)])
    ) as Record<CostCategory, string>
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    <Modal title="Editează jobul" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Nume job</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Început</label>
            <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Sfârșit</label>
            <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div>
          <p className={labelCls}>Buget pe categorii (lei)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {COST_CATEGORIES.map((c) => (
              <div key={c}>
                <label className={labelCls}>{COST_CATEGORY_LABELS[c]}</label>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={budgets[c]}
                  onChange={(e) => setBudgets((old) => ({ ...old, [c]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-[#D64545]">Eroare: {error}</p>}
        <div className="flex items-center justify-between border-t border-[#E8E8E8] pt-4">
          <button
            disabled={busy || !name.trim() || !startDate || !endDate}
            onClick={() =>
              run(
                () =>
                  updateJob(
                    job.id,
                    { name: name.trim(), startDate, endDate },
                    Object.fromEntries(
                      COST_CATEGORIES.map((c) => [c, toNum(budgets[c])])
                    ) as Record<CostCategory, number>
                  ),
                onSaved
              )
            }
            className="rounded-full bg-[#58A834] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
          >
            {busy ? 'Se salvează…' : 'Salvează modificările'}
          </button>
          <DangerButton
            label="Șterge jobul"
            onConfirmed={() => run(() => deleteJob(job.id), onDeleted)}
          />
        </div>
        <p className="text-xs text-[#5B6673]">
          Ștergerea jobului elimină definitiv taskurile, livrabilele, raportările și costurile lui.
        </p>
      </div>
    </Modal>
  )
}

// Starea de editare a unui livrabil în modalul de task
interface EditDeliv {
  id: string | null // null = livrabil nou
  name: string
  um: string
  qtyTotal: string
  qtyDone: string
  weight: string
  removed: boolean
}

/** Modalul de editare al taskului: nume, valoare, livrabile (cu corectarea qty realizat). */
function TaskEditModal({
  task,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: TaskRow
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(task.name)
  const [value, setValue] = useState(String(task.value))
  const [rows, setRows] = useState<EditDeliv[]>(
    task.deliverables.map((d: DeliverableRow) => ({
      id: d.id,
      name: d.name,
      um: d.um,
      qtyTotal: String(d.qty_total),
      qtyDone: String(d.qty_done),
      weight: String(d.weight),
      removed: false,
    }))
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const liveRows = rows.filter((r) => !r.removed)
  const weightSum = liveRows.reduce((s, r) => s + toNum(r.weight), 0)
  const weightsOk = liveRows.length === 0 || Math.abs(weightSum - 100) <= 0.01

  function setRow(i: number, patch: Partial<EditDeliv>) {
    setRows((old) => old.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await updateTask(task.id, { name: name.trim(), value: toNum(value) })
      let sort = 1
      for (const r of rows) {
        if (r.removed) {
          if (r.id) await deleteDeliverable(r.id)
          continue
        }
        const patch = {
          name: r.name.trim(),
          um: r.um.trim() || 'buc',
          qtyTotal: toNum(r.qtyTotal),
          qtyDone: toNum(r.qtyDone),
          weight: toNum(r.weight),
        }
        if (r.id) await updateDeliverable(r.id, patch)
        else await addDeliverable(task.id, patch, sort)
        sort++
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Editează taskul" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <label className={labelCls}>Nume task</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Valoare (lei)</label>
            <input className={inputCls} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Livrabile</p>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                weightsOk ? 'bg-[#DDEDDC] text-[#46862A]' : 'bg-[#F8DEDE] text-[#B23A3A]'
              }`}
            >
              ponderi: {num(weightSum)}%
            </span>
          </div>
          {rows.map((r, i) =>
            r.removed ? null : (
              <div key={r.id ?? `new-${i}`} className="flex items-end gap-2">
                <div className="flex-1">
                  <label className={labelCls}>Livrabil</label>
                  <input className={inputCls} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} />
                </div>
                <div className="w-16">
                  <label className={labelCls}>UM</label>
                  <input className={inputCls} value={r.um} onChange={(e) => setRow(i, { um: e.target.value })} />
                </div>
                <div className="w-20">
                  <label className={labelCls}>Realizat</label>
                  <input className={inputCls} inputMode="decimal" value={r.qtyDone} onChange={(e) => setRow(i, { qtyDone: e.target.value })} />
                </div>
                <div className="w-20">
                  <label className={labelCls}>Total</label>
                  <input className={inputCls} inputMode="decimal" value={r.qtyTotal} onChange={(e) => setRow(i, { qtyTotal: e.target.value })} />
                </div>
                <div className="w-20">
                  <label className={labelCls}>Pondere</label>
                  <input className={inputCls} inputMode="decimal" value={r.weight} onChange={(e) => setRow(i, { weight: e.target.value })} />
                </div>
                <DangerButton label="✕" armedLabel="Sigur?" onConfirmed={() => setRow(i, { removed: true })} />
              </div>
            )
          )}
          {!weightsOk && (
            <p className="text-sm text-[#D64545]">Ponderile dintr-un task trebuie să însumeze 100%.</p>
          )}
          <button
            onClick={() =>
              setRows((old) => [
                ...old,
                { id: null, name: '', um: '', qtyTotal: '', qtyDone: '0', weight: '', removed: false },
              ])
            }
            className="rounded-full bg-[#DDEDDC] px-4 py-2 text-sm font-medium text-[#46862A] hover:bg-[#CBE3C9]"
          >
            + Adaugă livrabil
          </button>
        </div>

        {error && <p className="text-sm text-[#D64545]">Eroare: {error}</p>}

        <div className="flex items-center justify-between border-t border-[#E8E8E8] pt-4">
          <button
            disabled={busy || !name.trim() || !weightsOk}
            onClick={save}
            className="rounded-full bg-[#58A834] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
          >
            {busy ? 'Se salvează…' : 'Salvează modificările'}
          </button>
          <DangerButton
            label="Șterge taskul"
            onConfirmed={async () => {
              setBusy(true)
              try {
                await deleteTask(task.id)
                onDeleted()
              } catch (e) {
                setError((e as Error).message)
                setBusy(false)
              }
            }}
          />
        </div>
        <p className="text-xs text-[#5B6673]">
          „Realizat" corectează cantitatea construită (ex. o zi raportată greșit). Istoricul
          zilnic din Vedere cronologică rămâne neschimbat.
        </p>
      </div>
    </Modal>
  )
}

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
  const p = deliverablePct(done, total)
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex-1 text-sm">
        {name}{' '}
        <span className="ml-1 inline-flex rounded-full bg-[#EEECE7] px-2 py-0.5 text-xs font-medium text-[#5B6673]">
          {num(weight)}%
        </span>
      </span>
      <ProgressBar donePct={p} className="w-28 shrink-0" />
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
  onChanged,
}: {
  task: TaskRow
  index: number
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
          />
        ))}
      </div>

      <p className="text-sm text-[#5B6673]">
        <strong className="text-[#0D1A2D]">{pct(pctDone)}</strong> din valoarea taskului realizată
      </p>

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
      </div>

      {editing && (
        <TaskEditModal
          task={task}
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

  const inputCls =
    'rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm outline-none focus:border-[#58A834]'

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
  projectName,
  onBack,
  onChanged,
  onCronologic,
  onJobDeleted,
}: {
  job: JobWithKpis
  projectName: string
  onBack: () => void
  onChanged: () => void
  onCronologic: () => void
  onJobDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const k = job.kpis
  const costOk = costColor(k.costVariance)
  const inLucru = job.tasks.filter((t) => t.status === 'in_lucru').length
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-6">
      <BackLink label={projectName} onClick={onBack} />

      {editing && (
        <JobEditModal
          job={job}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onDeleted={onJobDeleted}
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
          <h3 className="pt-2 text-base font-semibold">Taskuri</h3>
          {job.tasks.length === 0 && (
            <Card>
              <p className="text-sm text-[#5B6673]">Jobul nu are încă taskuri configurate.</p>
            </Card>
          )}
          {job.tasks.map((t, i) => (
            <TaskCard key={t.id} task={t} index={i} onChanged={onChanged} />
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
