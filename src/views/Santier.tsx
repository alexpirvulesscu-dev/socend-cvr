// Ecranele de șantier (mobile first, pentru Mihai):
//  1. Ziua de azi — header navy închis (singurul loc cu #0D1A2D + galben),
//     „Pontaj spune", un card pe task cu manoperă azi, „Închide ziua".
//  2. „Ce s-a construit azi" — un rând pe livrabil cu steppere de 52px,
//     „Salvează ziua" → RPC atomic → „Zi închisă ✓".
import { useMemo, useState } from 'react'
import { closeDay, type LabourTask, useLabourToday } from '../data/santier'
import { num } from '../lib/format'
import { Card } from '../components/ui'

function azi(): string {
  const s = new Date().toLocaleDateString('ro-RO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** „mai sunt 38 m țeavă · 62 suduri" — ce a rămas de construit pe task. */
function remainingText(t: LabourTask): string {
  const parts = t.deliverables
    .map((d) => {
      const left = Number(d.qty_total) - Number(d.qty_done)
      return left > 0 ? `${num(left)} ${d.um}` : null
    })
    .filter(Boolean)
  if (parts.length === 0) return 'cantități complete'
  return `mai sunt ${parts.join(' · ')}`
}

/** Header-ul de zi: navy închis cu accent galben — DOAR aici, conform design. */
function DayHeader({ workers, taskCount }: { workers: number; taskCount: number }) {
  return (
    <div className="bg-[#0D1A2D] px-4 pb-6 pt-5 text-white">
      <div className="mx-auto max-w-lg">
        <p className="text-sm text-white/60">Șantier</p>
        <h1 className="mt-1 text-2xl font-semibold">{azi()}</h1>
        <div className="mt-4 rounded-2xl bg-[#14263F] px-4 py-3">
          <p className="text-sm">
            <span className="font-semibold text-[#E2E04A]">Pontaj spune:</span>{' '}
            {num(workers)} muncitori pe {taskCount === 1 ? 'un task' : `${taskCount} taskuri`} azi
          </p>
        </div>
      </div>
    </div>
  )
}

function DayView({
  tasks,
  onReport,
}: {
  tasks: LabourTask[]
  onReport: () => void
}) {
  const totalWorkers = tasks.reduce((s, t) => s + t.workers, 0)

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-28">
      <DayHeader workers={totalWorkers} taskCount={tasks.length} />

      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        {tasks.length === 0 ? (
          <Card className="py-10 text-center">
            <p className="text-3xl">🌤</p>
            <p className="mt-2 font-medium">Nicio echipă pe teren azi</p>
            <p className="mt-1 text-sm text-[#5B6673]">
              Când Pontaj arată manoperă pe un task, el apare aici.
            </p>
          </Card>
        ) : (
          tasks.map((t) => (
            <Card key={t.taskId} onClick={onReport} className="space-y-1.5">
              <p className="text-xs text-[#5B6673]">
                {t.projectName} · {t.jobName}
              </p>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold leading-tight">{t.taskName}</h2>
                <span className="shrink-0 rounded-full bg-[#DDEDDC] px-2.5 py-1 text-xs font-medium text-[#46862A]">
                  {num(t.workers)} 👷
                </span>
              </div>
              <p className="text-sm text-[#5B6673]">{remainingText(t)}</p>
            </Card>
          ))
        )}
      </div>

      {tasks.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.9)] p-4 backdrop-blur-xl">
          <button
            onClick={onReport}
            className="mx-auto block w-full max-w-lg rounded-2xl bg-[#58A834] py-4 text-base font-semibold text-white hover:bg-[#46862A]"
          >
            Închide ziua · {tasks.length === 1 ? 'un task' : `${tasks.length} taskuri`}
          </button>
        </div>
      )}
    </div>
  )
}

/** Stepper de 52px — degete mari, mănuși, soare în ochi. */
function Stepper({
  value,
  onChange,
  max,
}: {
  value: number
  onChange: (v: number) => void
  max: number
}) {
  const btn =
    'h-[52px] w-[52px] shrink-0 rounded-2xl bg-[#EEECE7] text-2xl font-semibold text-[#0D1A2D] active:bg-[#E2DFD8] disabled:opacity-30'
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btn}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Scade"
      >
        −
      </button>
      <span className="w-12 text-center text-lg font-semibold tabular-nums">{num(value)}</span>
      <button
        type="button"
        className={btn}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        aria-label="Crește"
      >
        +
      </button>
    </div>
  )
}

function ReportView({
  tasks,
  onBack,
  onSaved,
}: {
  tasks: LabourTask[]
  onBack: () => void
  onSaved: () => void
}) {
  // cantitățile construite AZI, pe livrabil (pornesc de la 0)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const totalRows = useMemo(
    () => Object.values(qty).filter((v) => v > 0).length,
    [qty]
  )

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await closeDay(
        Object.entries(qty).map(([deliverable_id, q]) => ({ deliverable_id, qty: q }))
      )
      setSaved(true)
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (saved) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] px-4 pt-16">
        <Card className="mx-auto max-w-lg space-y-2 py-10 text-center">
          <p className="text-4xl">✓</p>
          <h1 className="text-xl font-semibold text-[#46862A]">Zi închisă ✓</h1>
          <p className="text-sm text-[#5B6673]">
            Cantitățile au fost salvate și progresul s-a actualizat.
          </p>
          <button
            onClick={onBack}
            className="mx-auto mt-4 block rounded-full bg-[#EEECE7] px-6 py-3 text-sm font-medium"
          >
            Înapoi la zi
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-28">
      <div className="bg-[#0D1A2D] px-4 pb-5 pt-5 text-white">
        <div className="mx-auto max-w-lg">
          <button onClick={onBack} className="text-sm text-white/60">
            ← {azi()}
          </button>
          <h1 className="mt-1 text-2xl font-semibold">Ce s-a construit azi?</h1>
        </div>
      </div>

      <div className="mx-auto max-w-lg space-y-3 px-4 pt-4">
        {tasks.map((t) => (
          <Card key={t.taskId} className="space-y-3">
            <div>
              <p className="text-xs text-[#5B6673]">
                {t.projectName} · {t.jobName}
              </p>
              <h2 className="font-semibold">{t.taskName}</h2>
            </div>
            {t.deliverables.map((d) => {
              const left = Math.max(0, Number(d.qty_total) - Number(d.qty_done))
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 border-t border-[#F3F1EC] pt-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-[#5B6673]">
                      {left > 0 ? `mai sunt ${num(left)} ${d.um}` : 'gata ✓'}
                    </p>
                  </div>
                  <Stepper
                    value={qty[d.id] ?? 0}
                    max={left}
                    onChange={(v) => setQty((old) => ({ ...old, [d.id]: v }))}
                  />
                </div>
              )
            })}
          </Card>
        ))}
        {error && <p className="text-sm text-[#D64545]">{error}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.9)] p-4 backdrop-blur-xl">
        <button
          onClick={save}
          disabled={busy || totalRows === 0}
          className="mx-auto block w-full max-w-lg rounded-2xl bg-[#58A834] py-4 text-base font-semibold text-white hover:bg-[#46862A] disabled:opacity-40"
        >
          {busy ? 'Se salvează…' : 'Salvează ziua'}
        </button>
      </div>
    </div>
  )
}

export function SantierView({ onDataChanged }: { onDataChanged?: () => void }) {
  const { tasks, loading, error, refetch } = useLabourToday()
  const [screen, setScreen] = useState<'day' | 'report'>('day')

  if (loading) return <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
  if (error) return <p className="p-8 text-center text-sm text-[#D64545]">Eroare: {error}</p>

  if (screen === 'report') {
    return (
      <ReportView
        tasks={tasks}
        onBack={() => {
          setScreen('day')
          refetch()
        }}
        onSaved={() => {
          // KPI-urile de birou (Proiecte) se recalculează imediat după salvare
          onDataChanged?.()
        }}
      />
    )
  }
  return <DayView tasks={tasks} onReport={() => setScreen('report')} />
}
