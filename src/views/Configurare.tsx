// Wizard-ul „Configurare proiect" în 4 pași:
//  1. Informații proiect  2. Joburi + buget pe 5 categorii
//  3. Taskuri             4. Livrabile (UM / cantitate / pondere)
// Cu bară laterală de sumar („Valoare totală contract") și verificarea live
// „Ponderile dintr-un task trebuie să însumeze 100%".
import { useMemo, useRef, useState } from 'react'
import { COST_CATEGORIES, COST_CATEGORY_LABELS, type CostCategory } from '../data/projects'
import { createProject, type NewProject } from '../data/mutations'
import { lei, num } from '../lib/format'
import { BackLink, Card } from '../components/ui'

// ── Starea wizard-ului (totul client-side până la Salvează) ──────────────
interface WJob {
  key: number
  name: string
  startDate: string
  endDate: string
  budgets: Record<CostCategory, string>
}
interface WTask {
  key: number
  jobKey: number
  name: string
  value: string
}
interface WDeliverable {
  key: number
  taskKey: number
  name: string
  um: string
  qtyTotal: string
  weight: string
}

const EMPTY_BUDGETS: Record<CostCategory, string> = {
  manopera: '',
  utilaje: '',
  materiale: '',
  subcontractori: '',
  organizare: '',
}

const STEPS = ['Informații proiect', 'Joburi și bugete', 'Taskuri', 'Livrabile']

const inputCls =
  'w-full rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm outline-none focus:border-[#58A834]'
const labelCls = 'mb-1 block text-xs font-medium text-[#5B6673]'
const addBtnCls =
  'rounded-full bg-[#DDEDDC] px-4 py-2 text-sm font-medium text-[#46862A] hover:bg-[#CBE3C9]'
const removeBtnCls = 'text-xs font-medium text-[#D64545] hover:underline'

function toNumber(s: string): number {
  const v = Number(s.replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}

export function ConfigurareView({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // pasul 1
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [billingMode, setBillingMode] = useState<'stadii_fizice' | 'lunara'>('stadii_fizice')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // pașii 2–4
  const [jobs, setJobs] = useState<WJob[]>([])
  const [tasks, setTasks] = useState<WTask[]>([])
  const [delivs, setDelivs] = useState<WDeliverable[]>([])
  const keyRef = useRef(1)

  function newKey(): number {
    return keyRef.current++
  }

  // ── Sumar: valoarea totală a contractului = suma valorilor taskurilor ──
  const totalValue = useMemo(() => tasks.reduce((s, t) => s + toNumber(t.value), 0), [tasks])

  // ── Verificarea live a ponderilor pe task ──
  const weightIssues = useMemo(() => {
    const issues: { taskKey: number; sum: number }[] = []
    for (const t of tasks) {
      const rows = delivs.filter((d) => d.taskKey === t.key)
      if (rows.length === 0) continue
      const sum = rows.reduce((s, d) => s + toNumber(d.weight), 0)
      if (Math.abs(sum - 100) > 0.01) issues.push({ taskKey: t.key, sum })
    }
    return issues
  }, [tasks, delivs])

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0
      case 1:
        return jobs.length > 0 && jobs.every((j) => j.name.trim() && j.startDate && j.endDate)
      case 2:
        return (
          tasks.length > 0 &&
          tasks.every((t) => t.name.trim() && toNumber(t.value) > 0) &&
          jobs.every((j) => tasks.some((t) => t.jobKey === j.key))
        )
      case 3:
        return (
          tasks.every((t) => delivs.some((d) => d.taskKey === t.key)) &&
          delivs.every((d) => d.name.trim() && toNumber(d.qtyTotal) > 0) &&
          weightIssues.length === 0
        )
      default:
        return false
    }
  }, [step, name, jobs, tasks, delivs, weightIssues])

  async function save() {
    setBusy(true)
    setError(null)
    const payload: NewProject = {
      name: name.trim(),
      client: client.trim(),
      billingMode,
      startDate,
      endDate,
      jobs: jobs.map((j) => ({
        name: j.name.trim(),
        startDate: j.startDate,
        endDate: j.endDate,
        budgets: Object.fromEntries(
          COST_CATEGORIES.map((c) => [c, toNumber(j.budgets[c])])
        ) as Record<CostCategory, number>,
        tasks: tasks
          .filter((t) => t.jobKey === j.key)
          .map((t) => ({
            name: t.name.trim(),
            value: toNumber(t.value),
            deliverables: delivs
              .filter((d) => d.taskKey === t.key)
              .map((d) => ({
                name: d.name.trim(),
                um: d.um.trim() || 'buc',
                qtyTotal: toNumber(d.qtyTotal),
                weight: toNumber(d.weight),
              })),
          })),
      })),
    }
    try {
      await createProject(payload)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <BackLink label="Proiecte" onClick={onCancel} />
      <h1 className="text-2xl font-semibold">Configurare proiect</h1>

      {/* indicator de pași */}
      <div className="mt-4 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              i === step
                ? 'bg-[#0D1A2D] text-white'
                : i < step
                  ? 'bg-[#DDEDDC] text-[#46862A]'
                  : 'bg-[#EEECE7] text-[#5B6673]'
            }`}
          >
            {i + 1}. {s}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          {/* ── Pasul 1: Informații proiect ── */}
          {step === 0 && (
            <Card className="space-y-4">
              <div>
                <label className={labelCls}>Nume proiect</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Termoficare Sector 4" />
              </div>
              <div>
                <label className={labelCls}>Client / beneficiar</label>
                <input className={inputCls} value={client} onChange={(e) => setClient(e.target.value)} placeholder="ex. CMTEB" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                <div>
                  <label className={labelCls}>Început</label>
                  <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Sfârșit</label>
                  <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </Card>
          )}

          {/* ── Pasul 2: Joburi + bugete pe 5 categorii ── */}
          {step === 1 && (
            <>
              {jobs.map((j, ji) => (
                <Card key={j.key} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">Job {ji + 1}</h3>
                    <button
                      className={removeBtnCls}
                      onClick={() => setJobs((old) => old.filter((x) => x.key !== j.key))}
                    >
                      Elimină
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className={labelCls}>Nume job</label>
                      <input
                        className={inputCls}
                        value={j.name}
                        placeholder="ex. PT4"
                        onChange={(e) =>
                          setJobs((old) => old.map((x) => (x.key === j.key ? { ...x, name: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Început</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={j.startDate}
                        onChange={(e) =>
                          setJobs((old) => old.map((x) => (x.key === j.key ? { ...x, startDate: e.target.value } : x)))
                        }
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Sfârșit</label>
                      <input
                        type="date"
                        className={inputCls}
                        value={j.endDate}
                        onChange={(e) =>
                          setJobs((old) => old.map((x) => (x.key === j.key ? { ...x, endDate: e.target.value } : x)))
                        }
                      />
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
                            value={j.budgets[c]}
                            placeholder="0"
                            onChange={(e) =>
                              setJobs((old) =>
                                old.map((x) =>
                                  x.key === j.key
                                    ? { ...x, budgets: { ...x.budgets, [c]: e.target.value } }
                                    : x
                                )
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
              <button
                className={addBtnCls}
                onClick={() =>
                  setJobs((old) => [
                    ...old,
                    { key: newKey(), name: '', startDate: '', endDate: '', budgets: { ...EMPTY_BUDGETS } },
                  ])
                }
              >
                + Adaugă job
              </button>
            </>
          )}

          {/* ── Pasul 3: Taskuri pe joburi ── */}
          {step === 2 && (
            <>
              {jobs.map((j) => (
                <Card key={j.key} className="space-y-3">
                  <h3 className="font-semibold">{j.name || 'Job fără nume'}</h3>
                  {tasks
                    .filter((t) => t.jobKey === j.key)
                    .map((t) => (
                      <div key={t.key} className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className={labelCls}>Task</label>
                          <input
                            className={inputCls}
                            value={t.name}
                            placeholder="ex. Înlocuire conductă"
                            onChange={(e) =>
                              setTasks((old) => old.map((x) => (x.key === t.key ? { ...x, name: e.target.value } : x)))
                            }
                          />
                        </div>
                        <div className="w-36">
                          <label className={labelCls}>Valoare (lei)</label>
                          <input
                            className={inputCls}
                            inputMode="decimal"
                            value={t.value}
                            placeholder="0"
                            onChange={(e) =>
                              setTasks((old) => old.map((x) => (x.key === t.key ? { ...x, value: e.target.value } : x)))
                            }
                          />
                        </div>
                        <button
                          className={`${removeBtnCls} pb-2`}
                          onClick={() => {
                            setTasks((old) => old.filter((x) => x.key !== t.key))
                            setDelivs((old) => old.filter((d) => d.taskKey !== t.key))
                          }}
                        >
                          Elimină
                        </button>
                      </div>
                    ))}
                  <button
                    className={addBtnCls}
                    onClick={() => setTasks((old) => [...old, { key: newKey(), jobKey: j.key, name: '', value: '' }])}
                  >
                    + Adaugă task
                  </button>
                </Card>
              ))}
            </>
          )}

          {/* ── Pasul 4: Livrabile cu UM / cantitate / pondere ── */}
          {step === 3 && (
            <>
              {tasks.map((t) => {
                const rows = delivs.filter((d) => d.taskKey === t.key)
                const wsum = rows.reduce((s, d) => s + toNumber(d.weight), 0)
                const bad = rows.length > 0 && Math.abs(wsum - 100) > 0.01
                return (
                  <Card key={t.key} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">{t.name || 'Task fără nume'}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                          bad || rows.length === 0
                            ? 'bg-[#F8DEDE] text-[#B23A3A]'
                            : 'bg-[#DDEDDC] text-[#46862A]'
                        }`}
                      >
                        ponderi: {num(wsum)}%
                      </span>
                    </div>
                    {rows.map((d) => (
                      <div key={d.key} className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className={labelCls}>Livrabil</label>
                          <input
                            className={inputCls}
                            value={d.name}
                            placeholder="ex. Țeavă montată"
                            onChange={(e) =>
                              setDelivs((old) => old.map((x) => (x.key === d.key ? { ...x, name: e.target.value } : x)))
                            }
                          />
                        </div>
                        <div className="w-20">
                          <label className={labelCls}>UM</label>
                          <input
                            className={inputCls}
                            value={d.um}
                            placeholder="m"
                            onChange={(e) =>
                              setDelivs((old) => old.map((x) => (x.key === d.key ? { ...x, um: e.target.value } : x)))
                            }
                          />
                        </div>
                        <div className="w-24">
                          <label className={labelCls}>Cantitate</label>
                          <input
                            className={inputCls}
                            inputMode="decimal"
                            value={d.qtyTotal}
                            placeholder="0"
                            onChange={(e) =>
                              setDelivs((old) =>
                                old.map((x) => (x.key === d.key ? { ...x, qtyTotal: e.target.value } : x))
                              )
                            }
                          />
                        </div>
                        <div className="w-24">
                          <label className={labelCls}>Pondere %</label>
                          <input
                            className={inputCls}
                            inputMode="decimal"
                            value={d.weight}
                            placeholder="100"
                            onChange={(e) =>
                              setDelivs((old) => old.map((x) => (x.key === d.key ? { ...x, weight: e.target.value } : x)))
                            }
                          />
                        </div>
                        <button
                          className={`${removeBtnCls} pb-2`}
                          onClick={() => setDelivs((old) => old.filter((x) => x.key !== d.key))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {bad && (
                      <p className="text-sm text-[#D64545]">
                        Ponderile dintr-un task trebuie să însumeze 100%.
                      </p>
                    )}
                    <button
                      className={addBtnCls}
                      onClick={() =>
                        setDelivs((old) => [
                          ...old,
                          { key: newKey(), taskKey: t.key, name: '', um: '', qtyTotal: '', weight: '' },
                        ])
                      }
                    >
                      + Adaugă livrabil
                    </button>
                  </Card>
                )
              })}
            </>
          )}

          {error && <p className="text-sm text-[#D64545]">Eroare la salvare: {error}</p>}

          {/* navigare între pași */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
              className="rounded-full bg-[#EEECE7] px-5 py-2.5 text-sm font-medium"
            >
              {step === 0 ? 'Renunță' : '← Înapoi'}
            </button>
            {step < 3 ? (
              <button
                disabled={!stepValid}
                onClick={() => setStep((s) => s + 1)}
                className="rounded-full bg-[#58A834] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
              >
                Continuă →
              </button>
            ) : (
              <button
                disabled={!stepValid || busy}
                onClick={save}
                className="rounded-full bg-[#58A834] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-40"
              >
                {busy ? 'Se salvează…' : 'Salvează proiectul'}
              </button>
            )}
          </div>
        </div>

        {/* ── Sumar lateral ── */}
        <div>
          <Card className="sticky top-16 space-y-3">
            <h3 className="text-sm font-semibold">Sumar</h3>
            <div>
              <p className="text-xs text-[#5B6673]">Valoare totală contract</p>
              <p className="text-xl font-semibold">{lei(totalValue)}</p>
            </div>
            <div className="space-y-1 border-t border-[#E8E8E8] pt-3 text-sm text-[#5B6673]">
              <p>{jobs.length === 1 ? 'un job' : `${jobs.length} joburi`}</p>
              <p>{tasks.length === 1 ? 'un task' : `${tasks.length} taskuri`}</p>
              <p>{delivs.length === 1 ? 'un livrabil' : `${delivs.length} livrabile`}</p>
            </div>
            {weightIssues.length > 0 && (
              <p className="border-t border-[#E8E8E8] pt-3 text-xs text-[#D64545]">
                {weightIssues.length === 1
                  ? 'Un task are ponderi care nu însumează 100%.'
                  : `${weightIssues.length} taskuri au ponderi care nu însumează 100%.`}
              </p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
