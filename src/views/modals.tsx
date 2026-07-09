// Modalele de creare/editare pentru joburi și taskuri — folosite și din
// ecranul de Proiect („+ Adaugă job") și din ecranul de Job.
// Fără prop-ul `job`/`task` modalul CREEAZĂ; cu el, EDITEAZĂ (și poate șterge).
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
  addDeliverable,
  addJob,
  addTask,
  deleteDeliverable,
  deleteJob,
  deleteTask,
  updateDeliverable,
  updateJob,
  updateTask,
} from '../data/mutations'
import { num } from '../lib/format'
import { DangerButton, Modal } from '../components/ui'

const inputCls =
  'w-full rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm outline-none focus:border-[#58A834]'
const labelCls = 'mb-1 block text-xs font-medium text-[#5B6673]'

function toNum(s: string): number {
  return Number(s.replace(/\./g, '').replace(',', '.')) || 0
}

// ── Job: creare sau editare ───────────────────────────────────────────────
export function JobModal({
  projectId,
  job,
  sortOrder,
  onClose,
  onSaved,
  onDeleted,
}: {
  projectId: string
  job?: JobWithKpis
  sortOrder: number
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}) {
  const [name, setName] = useState(job?.name ?? '')
  const [startDate, setStartDate] = useState(job?.start_date ?? '')
  const [endDate, setEndDate] = useState(job?.end_date ?? '')
  const [budgets, setBudgets] = useState<Record<CostCategory, string>>(
    Object.fromEntries(
      COST_CATEGORIES.map((c) => [c, String(job?.budgetByCategory[c] ?? 0)])
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

  const budgetNumbers = () =>
    Object.fromEntries(COST_CATEGORIES.map((c) => [c, toNum(budgets[c])])) as Record<
      CostCategory,
      number
    >

  return (
    <Modal title={job ? 'Editează jobul' : 'Adaugă job'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Nume job</label>
            <input className={inputCls} value={name} placeholder="ex. PT4" onChange={(e) => setName(e.target.value)} />
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
                  job
                    ? updateJob(job.id, { name: name.trim(), startDate, endDate }, budgetNumbers())
                    : addJob(projectId, { name: name.trim(), startDate, endDate }, budgetNumbers(), sortOrder),
                onSaved
              )
            }
            className="rounded-full bg-[#58A834] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
          >
            {busy ? 'Se salvează…' : job ? 'Salvează modificările' : 'Adaugă jobul'}
          </button>
          {job && onDeleted && (
            <DangerButton label="Șterge jobul" onConfirmed={() => run(() => deleteJob(job.id), onDeleted)} />
          )}
        </div>
        {job && (
          <p className="text-xs text-[#5B6673]">
            Ștergerea jobului elimină definitiv taskurile, livrabilele, raportările și costurile lui.
          </p>
        )}
      </div>
    </Modal>
  )
}

// ── Task: creare sau editare (cu livrabilele lui) ─────────────────────────
interface EditDeliv {
  id: string | null // null = livrabil nou
  name: string
  um: string
  qtyTotal: string
  qtyDone: string
  weight: string
  manDays: string
  removed: boolean
}

export function TaskModal({
  jobId,
  task,
  sortOrder,
  onClose,
  onSaved,
  onDeleted,
}: {
  jobId: string
  task?: TaskRow
  sortOrder: number
  onClose: () => void
  onSaved: () => void
  onDeleted?: () => void
}) {
  const [name, setName] = useState(task?.name ?? '')
  const [value, setValue] = useState(String(task?.value ?? ''))
  const [rows, setRows] = useState<EditDeliv[]>(
    (task?.deliverables ?? []).map((d: DeliverableRow) => ({
      id: d.id,
      name: d.name,
      um: d.um,
      qtyTotal: String(d.qty_total),
      qtyDone: String(d.qty_done),
      weight: String(d.weight),
      manDays: d.planned_man_days == null ? '' : String(d.planned_man_days),
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
      const patchOf = (r: EditDeliv) => ({
        name: r.name.trim(),
        um: r.um.trim() || 'buc',
        qtyTotal: toNum(r.qtyTotal),
        qtyDone: toNum(r.qtyDone),
        weight: toNum(r.weight),
        plannedManDays: r.manDays.trim() === '' ? null : toNum(r.manDays),
      })
      if (task) {
        await updateTask(task.id, { name: name.trim(), value: toNum(value) })
        let sort = 1
        for (const r of rows) {
          if (r.removed) {
            if (r.id) await deleteDeliverable(r.id)
            continue
          }
          if (r.id) await updateDeliverable(r.id, patchOf(r))
          else await addDeliverable(task.id, patchOf(r), sort)
          sort++
        }
      } else {
        await addTask(jobId, { name: name.trim(), value: toNum(value) }, liveRows.map(patchOf), sortOrder)
      }
      onSaved()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal title={task ? 'Editează taskul' : 'Adaugă task'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <label className={labelCls}>Nume task</label>
            <input className={inputCls} value={name} placeholder="ex. Înlocuire conductă" onChange={(e) => setName(e.target.value)} />
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
                <div className="w-24">
                  <label className={labelCls}>Oameni-zile</label>
                  <input className={inputCls} inputMode="decimal" value={r.manDays} placeholder="ex. 12" onChange={(e) => setRow(i, { manDays: e.target.value })} />
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
              setRows((old) => {
                // ponderea nouă se precompletează cu restul până la 100%
                const used = old.filter((r) => !r.removed).reduce((s, r) => s + toNum(r.weight), 0)
                const rest = Math.max(0, 100 - used)
                return [
                  ...old,
                  { id: null, name: '', um: '', qtyTotal: '', qtyDone: '0', weight: String(rest), manDays: '', removed: false },
                ]
              })
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
            {busy ? 'Se salvează…' : task ? 'Salvează modificările' : 'Adaugă taskul'}
          </button>
          {task && onDeleted && (
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
          )}
        </div>
        <p className="text-xs text-[#5B6673]">
          „Realizat" corectează cantitatea construită (ex. o zi raportată greșit). Istoricul
          zilnic din Vedere cronologică rămâne neschimbat.
        </p>
      </div>
    </Modal>
  )
}
