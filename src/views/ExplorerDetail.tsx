// Panoul „Detaliu" al Explorer-ului — editează nivelul selectat, inline:
//  - proiect: date, client, flux facturare, costuri P&L, finalizare/ștergere
//  - job: date, buget vs cost (buget editabil), costuri înregistrate, cronologic
//  - task: livrabile cu TOATE celulele editabile, țintă de efort, status
// Toate salvările sunt optimiste (patch local → persist → revert+toast la eroare).
import { useMemo, useState } from 'react'
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CostCategory,
  type JobWithKpis,
  type ProjectWithKpis,
  type TaskRow,
} from '../data/projects'
import {
  addCostEntry,
  addDeliverable,
  deleteCostEntry,
  deleteDeliverable,
  deleteJob,
  deleteProject,
  deleteTask,
  duplicateJob,
  duplicateTask,
  setProjectActive,
  setTaskStatus,
  updateBilling,
  updateDeliverable,
  updateJob,
  updateJobBudget,
  updateProject,
  updateTask,
  updateTaskDates,
} from '../data/mutations'
import { useTaskManDays } from '../data/cronologic'
import { deliverablePct, taskPct } from '../domain/kpi'
import { dataRo, lei, num, pct, toNum } from '../lib/format'
import { Card, DangerButton, NeutralPill, ProgressBar, StatusPill } from '../components/ui'
import { InlineEdit } from '../components/InlineEdit'
import { toast } from '../components/Toast'
import type { Selection } from '../lib/selection'
import type { Save } from './Explorer'

const addInputCls =
  'w-full rounded-lg border border-[#E8E8E8] bg-white px-2 py-1.5 text-sm outline-none focus:border-[#58A834]'

/** Eticheta mică de deasupra unui câmp inline. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
      {children}
    </span>
  )
}

// ── Detaliu · PROIECT ────────────────────────────────────────────────────

/** Fluxul de facturare, cu cele 4 valori editabile inline. */
function FluxFacturareInline({ p, save }: { p: ProjectWithKpis; save: Save }) {
  const b = p.billing
  const steps: { key: keyof typeof b; label: string; highlight?: boolean }[] = [
    { key: 'depus', label: 'Executat' },
    { key: 'certificat', label: 'Aprobat' },
    { key: 'facturat', label: 'Facturat' },
    { key: 'incasat', label: 'Încasat', highlight: true },
  ]
  function saveStep(key: keyof typeof b, raw: string) {
    const v = toNum(raw)
    save(
      { kind: 'billing', id: p.id, patch: { [key]: v } },
      { kind: 'billing', id: p.id, patch: { [key]: b[key] } },
      () => updateBilling(p.id, { ...b, [key]: v })
    )
  }
  return (
    <Card>
      <h3 className="mb-3 text-base font-semibold">Flux facturare client</h3>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-start gap-2">
            {i > 0 && (
              <span aria-hidden className="mt-1 hidden text-[#C9C5BC] xl:block">
                →
              </span>
            )}
            <div>
              <FieldLabel>{s.label}</FieldLabel>
              <InlineEdit
                type="number"
                value={String(b[s.key])}
                display={
                  <span
                    className={`text-lg font-semibold tracking-tight ${s.highlight ? 'text-[#F0A800]' : ''}`}
                  >
                    {lei(b[s.key])}
                  </span>
                }
                onSave={(raw) => saveStep(s.key, raw)}
                inputClassName="w-28 text-lg font-semibold"
              />
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

/** Costul real al proiectului, dedus din P&L pe cele 6 categorii CVR. */
function CosturiPnl({ p }: { p: ProjectWithKpis }) {
  const c = p.pnlCosts
  if (!c) return null
  const rows: [string, number][] = [
    ['Manoperă (salarii)', c.manopera],
    ['Materiale și consumabile', c.materiale],
    ['Subcontractori', c.subcontractori],
    ['Combustibil și transport', c.combustibil],
    ['Echipamente și utilaje', c.echipamente],
    ['Overheads (cheltuieli generale)', c.overheads],
  ]
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-base font-semibold">Costuri reale · din P&amp;L</h3>
        <span className="text-sm font-semibold">{lei(c.total)}</span>
      </div>
      <div className="divide-y divide-[#F3F1EC]">
        {rows.map(([label, val]) => (
          <div key={label} className="flex items-center justify-between py-2 text-sm">
            <span>{label}</span>
            <span className="text-[#5B6673]">{lei(val)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 border-t border-[#E8E8E8] pt-3 text-xs text-[#5B6673]">
        Trase automat din plățile din P&amp;L. Manopera și cheltuielile generale se repartizează
        pe proiecte (vezi „Cum se calculează"). Se actualizează pe măsură ce n8n importă facturi.
      </p>
    </Card>
  )
}

export function CumSeCalculeaza() {
  // pliat implicit — informația apare doar la cerere, nu poluează pagina
  const [open, setOpen] = useState(false)
  const rows = [
    ['Progres', 'valoarea taskului × procentul realizat din livrabile, adunat pe tot proiectul'],
    ['Grafic', '(procent planificat azi − procent realizat) × durata jobului, în zile; media pe proiect e ponderată cu valoarea joburilor'],
    ['Cost vs buget', 'bugetul câștigat (buget × procent realizat) minus costurile reale din P&L; plus = sub buget'],
    ['Marjă la zi', '(lucrări executate − costuri reale din P&L) ÷ lucrări executate'],
    ['Încasări', 'încasat ÷ facturat; WIP = lucrări executate care nu au fost încă facturate'],
  ]
  // regulile de repartizare a costurilor din P&L (cerute de Alex, ca să le țină minte)
  const costRules: [string, string][] = [
    ['1. Manoperă (salarii și contribuții)', 'după oameni-zile: orele de pontaj ale proiectului ÷ total ore × totalul salariilor din P&L. Ex: 100 din 1000 oameni-zile pe un proiect = 10% din salarii.'],
    ['2. Materiale și consumabile', 'direct din P&L pe proiect + cota-parte (după valoarea contractului) din materialele company-wide.'],
    ['3. Subcontractori', 'direct din P&L pe proiect + cotă company-wide.'],
    ['4. Combustibil și transport', 'direct din P&L pe proiect + cotă company-wide.'],
    ['5. Echipamente și utilaje', 'însumează 3 categorii P&L (Echipamente + Scule și unelte + Utilaje); direct pe proiect + cotă company-wide.'],
    ['6. Overheads', 'alte cheltuieli, asigurări, birou, instructaje, marketing, PPE, servicii bancare, servicii profesionale, taxe — 100% repartizate după valoarea contractului (contract mai mare = pondere mai mare).'],
  ]
  return (
    <Card className="!p-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <h3 className="text-base font-semibold">Cum se calculează</h3>
        <span aria-hidden className={`text-[#C9C5BC] transition-transform ${open ? 'rotate-90' : ''}`}>
          ›
        </span>
      </button>
      {open && (
        <div className="space-y-4 px-5 pb-5">
          <dl className="space-y-2">
            {rows.map(([term, def]) => (
              <div key={term} className="text-sm">
                <dt className="inline font-medium">{term}:</dt>{' '}
                <dd className="inline text-[#5B6673]">{def}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-[#E8E8E8] pt-3">
            <p className="mb-2 text-sm font-semibold">
              Costurile reale — de unde vin și cum se repartizează din P&amp;L
            </p>
            <dl className="space-y-2">
              {costRules.map(([term, def]) => (
                <div key={term} className="text-sm">
                  <dt className="font-medium">{term}</dt>
                  <dd className="text-[#5B6673]">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </Card>
  )
}

function ProjectDetail({
  p,
  save,
  onRefetch,
  onSelect,
}: {
  p: ProjectWithKpis
  save: Save
  onRefetch: () => void
  onSelect: (sel: Selection) => void
}) {
  // toate câmpurile de proiect persistă prin updateProject (care cere patch-ul
  // complet + sincronul P&L la redenumire) — construim patch-ul din rândul curent
  function persistProject(over: Partial<{ name: string; client: string; billingMode: 'stadii_fizice' | 'lunara'; startDate: string; endDate: string; isSmall: boolean }>) {
    return updateProject(p.id, p.pnl_proiect_id, {
      name: p.name,
      client: p.client ?? '',
      billingMode: p.billing_mode === 'lunara' ? 'lunara' : 'stadii_fizice',
      startDate: p.start_date ?? '',
      endDate: p.end_date ?? '',
      isSmall: p.is_small,
      ...over,
    })
  }
  const [busy, setBusy] = useState(false)

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <InlineEdit
            value={p.name}
            display={<span className="text-xl font-semibold leading-tight">{p.name}</span>}
            onSave={(raw) => {
              if (!raw) return
              save(
                { kind: 'project', id: p.id, patch: { name: raw } },
                { kind: 'project', id: p.id, patch: { name: p.name } },
                () => persistProject({ name: raw })
              )
            }}
            inputClassName="text-xl font-semibold w-72"
          />
          {!p.active && <NeutralPill>Finalizat</NeutralPill>}
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <FieldLabel>Client</FieldLabel>
            <InlineEdit
              value={p.client ?? ''}
              placeholder="fără client"
              onSave={(raw) =>
                save(
                  { kind: 'project', id: p.id, patch: { client: raw || null } },
                  { kind: 'project', id: p.id, patch: { client: p.client } },
                  () => persistProject({ client: raw })
                )
              }
              className="text-sm"
            />
          </div>
          <div>
            <FieldLabel>Facturare</FieldLabel>
            <select
              value={p.billing_mode === 'lunara' ? 'lunara' : 'stadii_fizice'}
              onChange={(e) => {
                const v = e.target.value as 'stadii_fizice' | 'lunara'
                save(
                  { kind: 'project', id: p.id, patch: { billing_mode: v } },
                  { kind: 'project', id: p.id, patch: { billing_mode: p.billing_mode } },
                  () => persistProject({ billingMode: v })
                )
              }}
              className="mt-0.5 w-full cursor-pointer rounded-md bg-transparent text-sm outline-none hover:bg-[#EEECE7]"
            >
              <option value="stadii_fizice">Pe stadii fizice</option>
              <option value="lunara">Lunară</option>
            </select>
          </div>
          <div>
            <FieldLabel>Început</FieldLabel>
            <InlineEdit
              type="date"
              value={p.start_date ?? ''}
              display={<span className="text-sm">{p.start_date ? dataRo(p.start_date) : '—'}</span>}
              onSave={(raw) =>
                save(
                  { kind: 'project', id: p.id, patch: { start_date: raw || null } },
                  { kind: 'project', id: p.id, patch: { start_date: p.start_date } },
                  () => persistProject({ startDate: raw })
                )
              }
            />
          </div>
          <div>
            <FieldLabel>Sfârșit</FieldLabel>
            <InlineEdit
              type="date"
              value={p.end_date ?? ''}
              display={<span className="text-sm">{p.end_date ? dataRo(p.end_date) : '—'}</span>}
              onSave={(raw) =>
                save(
                  { kind: 'project', id: p.id, patch: { end_date: raw || null } },
                  { kind: 'project', id: p.id, patch: { end_date: p.end_date } },
                  () => persistProject({ endDate: raw })
                )
              }
            />
          </div>
        </div>

        <p className="text-sm text-[#5B6673]">
          Contract {lei(Number(p.contract_value))} · valoarea = suma taskurilor
        </p>

        <div className="flex flex-wrap items-center gap-2 border-t border-[#E8E8E8] pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={p.is_small}
              onChange={(e) => {
                const v = e.target.checked
                save(
                  { kind: 'project', id: p.id, patch: { is_small: v } },
                  { kind: 'project', id: p.id, patch: { is_small: p.is_small } },
                  () => persistProject({ isSmall: v })
                )
              }}
              className="h-4 w-4 accent-[#58A834]"
            />
            Proiect mic
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true)
                save(
                  { kind: 'project', id: p.id, patch: { active: !p.active } },
                  { kind: 'project', id: p.id, patch: { active: p.active } },
                  () => setProjectActive(p.id, p.pnl_proiect_id, !p.active)
                )
                setBusy(false)
              }}
              className="rounded-full bg-[#EEECE7] px-4 py-2 text-sm font-medium hover:bg-[#E2DFD8] disabled:opacity-40"
            >
              {p.active ? 'Marchează finalizat' : 'Reactivează proiectul'}
            </button>
            <DangerButton
              label="Șterge proiectul"
              onConfirmed={() => {
                deleteProject(p.id, p.pnl_proiect_id)
                  .then(() => {
                    onSelect({})
                    onRefetch()
                  })
                  .catch((e: Error) => toast(`Nu s-a șters: ${e.message}`))
              }}
            />
          </div>
        </div>
        <p className="text-xs text-[#5B6673]">
          Ștergerea elimină definitiv proiectul din CVR (joburi, taskuri, raportări, costuri).
          În P&amp;L, proiectul legat doar se dezactivează — istoricul de plăți rămâne.
        </p>
      </Card>

      <FluxFacturareInline p={p} save={save} />
      <CosturiPnl p={p} />
      <CumSeCalculeaza />
    </div>
  )
}

// ── Detaliu · JOB ────────────────────────────────────────────────────────

function BugetVsCostInline({ job, save }: { job: JobWithKpis; save: Save }) {
  function saveBudget(cat: CostCategory, raw: string) {
    const v = toNum(raw)
    const nextRows = COST_CATEGORIES.map((c) => ({
      category: c,
      amount: c === cat ? v : job.budgetByCategory[c],
    }))
    const prevRows = COST_CATEGORIES.map((c) => ({ category: c, amount: job.budgetByCategory[c] }))
    save(
      { kind: 'job', id: job.id, patch: { cvr_job_budgets: nextRows } },
      { kind: 'job', id: job.id, patch: { cvr_job_budgets: prevRows } },
      () => updateJobBudget(job.id, cat, v)
    )
  }
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
                {lei(cost)} <span className="text-[#C9C5BC]">/</span>{' '}
                <InlineEdit
                  type="number"
                  value={String(budget)}
                  display={<span>{lei(budget)}</span>}
                  onSave={(raw) => saveBudget(cat, raw)}
                  inputClassName="w-24 text-right"
                />
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
      <p className="mt-2 text-xs text-[#5B6673]">bugetul se editează cu click pe valoare</p>
    </Card>
  )
}

function CosturiJob({
  job,
  save,
  onRefetch,
}: {
  job: JobWithKpis
  save: Save
  onRefetch: () => void
}) {
  const [category, setCategory] = useState<CostCategory>('manopera')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = toNum(amount)
    if (!value || value <= 0) {
      toast('Introdu o sumă mai mare ca 0.')
      return
    }
    setBusy(true)
    try {
      await addCostEntry(job.id, { category, amount: value, description, entryDate })
      setAmount('')
      setDescription('')
      onRefetch()
    } catch (err) {
      toast(`Costul nu s-a salvat: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  function removeCost(id: string) {
    const prev = job.cvr_cost_entries
    save(
      { kind: 'job', id: job.id, patch: { cvr_cost_entries: prev.filter((c) => c.id !== id) } },
      { kind: 'job', id: job.id, patch: { cvr_cost_entries: prev } },
      () => deleteCostEntry(id)
    )
  }

  return (
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
                <DangerButton label="✕" armedLabel="Sigur?" onConfirmed={() => removeCost(c.id)} />
              </div>
            ))}
        </div>
      )}

      <form onSubmit={submit} className="mt-4 space-y-3 border-t border-[#E8E8E8] pt-4">
        <h4 className="text-sm font-semibold">Adaugă cost</h4>
        <div className="grid grid-cols-2 gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CostCategory)}
            className={addInputCls}
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
            className={addInputCls}
            aria-label="Suma în lei"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descriere"
            className={addInputCls}
            aria-label="Descriere"
          />
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className={addInputCls}
            aria-label="Data"
          />
        </div>
        <button
          disabled={busy}
          className="rounded-full bg-[#58A834] px-4 py-2 text-sm font-medium text-white hover:bg-[#46862A] disabled:opacity-50"
        >
          {busy ? 'Se salvează…' : 'Salvează costul'}
        </button>
      </form>
    </Card>
  )
}

function JobDetail({
  p,
  job,
  save,
  onRefetch,
  onSelect,
  onOpenCronologic,
}: {
  p: ProjectWithKpis
  job: JobWithKpis
  save: Save
  onRefetch: () => void
  onSelect: (sel: Selection) => void
  onOpenCronologic: (projectId: string, jobId: string) => void
}) {
  const [duplicating, setDuplicating] = useState(false)
  // updateJob persistă nume+date împreună (mutația existentă); bugetele au mutația lor
  function persistJob(over: Partial<{ name: string; startDate: string; endDate: string }>) {
    return updateJob(
      job.id,
      { name: job.name, startDate: job.start_date, endDate: job.end_date, ...over },
      job.budgetByCategory
    )
  }
  const k = job.kpis

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <InlineEdit
            value={job.name}
            display={<span className="text-xl font-semibold leading-tight">{job.name}</span>}
            onSave={(raw) => {
              if (!raw) return
              save(
                { kind: 'job', id: job.id, patch: { name: raw } },
                { kind: 'job', id: job.id, patch: { name: job.name } },
                () => persistJob({ name: raw })
              )
            }}
            inputClassName="text-xl font-semibold w-72"
          />
          <span className="text-sm font-semibold">{lei(k.value)}</span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <FieldLabel>Început</FieldLabel>
            <InlineEdit
              type="date"
              value={job.start_date}
              display={<span className="text-sm">{dataRo(job.start_date)}</span>}
              onSave={(raw) => {
                if (!raw) return
                save(
                  { kind: 'job', id: job.id, patch: { start_date: raw } },
                  { kind: 'job', id: job.id, patch: { start_date: job.start_date } },
                  () => persistJob({ startDate: raw })
                )
              }}
            />
          </div>
          <div>
            <FieldLabel>Sfârșit</FieldLabel>
            <InlineEdit
              type="date"
              value={job.end_date}
              display={<span className="text-sm">{dataRo(job.end_date)}</span>}
              onSave={(raw) => {
                if (!raw) return
                save(
                  { kind: 'job', id: job.id, patch: { end_date: raw } },
                  { kind: 'job', id: job.id, patch: { end_date: job.end_date } },
                  () => persistJob({ endDate: raw })
                )
              }}
            />
          </div>
          <div>
            <FieldLabel>Progres</FieldLabel>
            <span className="text-sm font-semibold">{pct(k.donePct)}</span>
          </div>
          <div>
            <FieldLabel>Grafic</FieldLabel>
            <span className="text-sm">{`plan ${pct(k.planPct, 0)}`}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ProgressBar donePct={k.donePct} planPct={k.planPct} className="flex-1" />
          <span className="shrink-0 text-sm font-semibold">{pct(k.donePct)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[#E8E8E8] pt-3">
          <button
            onClick={() => onOpenCronologic(p.id, job.id)}
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
                  p.id,
                  {
                    name: job.name,
                    start_date: job.start_date,
                    end_date: job.end_date,
                    tasks: job.tasks,
                    budgets: job.budgetByCategory,
                  },
                  p.jobs.length + 1
                )
                onRefetch()
              } catch (e) {
                toast(`Nu s-a duplicat: ${(e as Error).message}`)
              } finally {
                setDuplicating(false)
              }
            }}
            className="rounded-full border border-[#E8E8E8] bg-white px-4 py-1.5 text-sm font-medium hover:border-[#58A834] disabled:opacity-50"
          >
            {duplicating ? 'Se duplică…' : 'Duplică jobul'}
          </button>
          <div className="ml-auto">
            <DangerButton
              label="Șterge jobul"
              onConfirmed={() => {
                deleteJob(job.id)
                  .then(() => {
                    onSelect({ projectId: p.id })
                    onRefetch()
                  })
                  .catch((e: Error) => toast(`Nu s-a șters: ${e.message}`))
              }}
            />
          </div>
        </div>
      </Card>

      <BugetVsCostInline job={job} save={save} />
      <CosturiJob job={job} save={save} onRefetch={onRefetch} />
    </div>
  )
}

// ── Detaliu · TASK ───────────────────────────────────────────────────────

function TaskDetail({
  p,
  job,
  task,
  save,
  onRefetch,
  onSelect,
}: {
  p: ProjectWithKpis
  job: JobWithKpis
  task: TaskRow
  save: Save
  onRefetch: () => void
  onSelect: (sel: Selection) => void
}) {
  const manDays = useTaskManDays(useMemo(() => [task.id], [task.id]))
  const consumedMd = manDays[task.id] ?? 0
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({ name: '', um: 'buc', total: '', weight: '', manDays: '' })

  const pctDone = taskPct(
    task.deliverables.map((d) => ({
      qtyTotal: Number(d.qty_total),
      qtyDone: Number(d.qty_done),
      weight: Number(d.weight),
    }))
  )
  const weightSum = task.deliverables.reduce((s, d) => s + Number(d.weight), 0)

  // Ținta de efort: planul e suma oamenilor-zile pe livrabile (fallback: task)
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

  function persistTask(over: Partial<{ name: string; value: number }>) {
    return updateTask(task.id, { name: task.name, value: Number(task.value), ...over })
  }

  /** Salvează o celulă a unui livrabil (patch complet construit din rândul curent). */
  function saveDeliv(
    d: TaskRow['deliverables'][number],
    field: 'name' | 'um' | 'qty_done' | 'qty_total' | 'weight' | 'planned_man_days',
    raw: string
  ) {
    const parsed =
      field === 'name' || field === 'um'
        ? raw
        : field === 'planned_man_days'
          ? raw.trim() === ''
            ? null
            : toNum(raw)
          : toNum(raw)
    save(
      { kind: 'deliverable', id: d.id, patch: { [field]: parsed } },
      { kind: 'deliverable', id: d.id, patch: { [field]: d[field] } },
      () =>
        updateDeliverable(d.id, {
          name: field === 'name' ? (parsed as string) : d.name,
          um: field === 'um' ? (parsed as string) : d.um,
          qtyTotal: field === 'qty_total' ? (parsed as number) : Number(d.qty_total),
          qtyDone: field === 'qty_done' ? (parsed as number) : Number(d.qty_done),
          weight: field === 'weight' ? (parsed as number) : Number(d.weight),
          plannedManDays:
            field === 'planned_man_days'
              ? (parsed as number | null)
              : d.planned_man_days == null
                ? null
                : Number(d.planned_man_days),
        })
    )
  }

  function removeDeliv(id: string) {
    const prev = task.deliverables
    save(
      { kind: 'task', id: task.id, patch: { deliverables: prev.filter((d) => d.id !== id) } },
      { kind: 'task', id: task.id, patch: { deliverables: prev } },
      () => deleteDeliverable(id)
    )
  }

  async function saveNewDeliv() {
    if (!newRow.name.trim() || toNum(newRow.total) <= 0) {
      toast('Completează numele și cantitatea totală.')
      return
    }
    try {
      await addDeliverable(
        task.id,
        {
          name: newRow.name.trim(),
          um: newRow.um.trim() || 'buc',
          qtyTotal: toNum(newRow.total),
          qtyDone: 0,
          weight: toNum(newRow.weight),
          plannedManDays: newRow.manDays.trim() === '' ? null : toNum(newRow.manDays),
        },
        task.deliverables.length + 1
      )
      setAdding(false)
      setNewRow({ name: '', um: 'buc', total: '', weight: '', manDays: '' })
      onRefetch()
    } catch (e) {
      toast(`Livrabilul nu s-a creat: ${(e as Error).message}`)
    }
  }

  function setStatus(status: 'in_lucru' | 'finalizat') {
    save(
      { kind: 'task', id: task.id, patch: { status } },
      { kind: 'task', id: task.id, patch: { status: task.status } },
      () => setTaskStatus(task.id, status)
    )
  }

  const index = job.tasks.findIndex((t) => t.id === task.id)

  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-[#5B6673]">{String(index + 1).padStart(2, '0')} ·</span>
            <InlineEdit
              value={task.name}
              display={<span className="text-xl font-semibold leading-tight">{task.name}</span>}
              onSave={(raw) => {
                if (!raw) return
                save(
                  { kind: 'task', id: task.id, patch: { name: raw } },
                  { kind: 'task', id: task.id, patch: { name: task.name } },
                  () => persistTask({ name: raw })
                )
              }}
              inputClassName="text-xl font-semibold w-72"
            />
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={task.status} />
            <InlineEdit
              type="number"
              value={String(task.value)}
              display={<span className="text-sm font-semibold">{lei(Number(task.value))}</span>}
              onSave={(raw) =>
                save(
                  { kind: 'task', id: task.id, patch: { value: toNum(raw) } },
                  { kind: 'task', id: task.id, patch: { value: task.value } },
                  () => persistTask({ value: toNum(raw) })
                )
              }
              inputClassName="w-28 text-right text-sm font-semibold"
            />
          </div>
        </div>

        {/* Datele de plan ale taskului (bara lui din Gantt) */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <FieldLabel>Început plan</FieldLabel>
            <InlineEdit
              type="date"
              value={task.start_date ?? ''}
              display={
                <span className="text-sm">
                  {task.start_date ? dataRo(task.start_date) : 'ca jobul'}
                </span>
              }
              onSave={(raw) =>
                save(
                  { kind: 'task', id: task.id, patch: { start_date: raw || null } },
                  { kind: 'task', id: task.id, patch: { start_date: task.start_date } },
                  () => updateTaskDates(task.id, raw || null, task.end_date)
                )
              }
            />
          </div>
          <div>
            <FieldLabel>Sfârșit plan</FieldLabel>
            <InlineEdit
              type="date"
              value={task.end_date ?? ''}
              display={
                <span className="text-sm">{task.end_date ? dataRo(task.end_date) : 'ca jobul'}</span>
              }
              onSave={(raw) =>
                save(
                  { kind: 'task', id: task.id, patch: { end_date: raw || null } },
                  { kind: 'task', id: task.id, patch: { end_date: task.end_date } },
                  () => updateTaskDates(task.id, task.start_date, raw || null)
                )
              }
            />
          </div>
          <div>
            <FieldLabel>Realizat</FieldLabel>
            <span className="text-sm font-semibold">{pct(pctDone)}</span>
          </div>
          <div>
            <FieldLabel>Pondere totală</FieldLabel>
            <span className={`text-sm font-semibold ${Math.round(weightSum) === 100 ? '' : 'text-[#D64545]'}`}>
              {num(weightSum)}%
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[#E8E8E8] pt-3">
          {task.status === 'neinceput' && (
            <button
              onClick={() => setStatus('in_lucru')}
              className="rounded-full bg-[#58A834] px-4 py-2 text-sm font-medium text-white hover:bg-[#46862A]"
            >
              Pornește taskul
            </button>
          )}
          {task.status === 'in_lucru' && (
            <button
              onClick={() => setStatus('finalizat')}
              className="rounded-full bg-[#DDEDDC] px-4 py-2 text-sm font-medium text-[#46862A] hover:bg-[#CBE3C9]"
            >
              Marchează finalizat
            </button>
          )}
          {task.status === 'finalizat' && (
            <button
              onClick={() => setStatus('in_lucru')}
              className="rounded-full bg-[#EEECE7] px-4 py-2 text-sm font-medium hover:bg-[#E2DFD8]"
            >
              Redeschide taskul
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await duplicateTask(job.id, task, job.tasks.length + 1)
                onRefetch()
              } catch (e) {
                toast(`Nu s-a duplicat: ${(e as Error).message}`)
              }
            }}
            className="rounded-full border border-[#E8E8E8] bg-white px-4 py-2 text-sm font-medium text-[#5B6673] hover:border-[#58A834] hover:text-[#0D1A2D]"
          >
            Duplică
          </button>
          <div className="ml-auto">
            <DangerButton
              label="Șterge taskul"
              onConfirmed={() => {
                deleteTask(task.id)
                  .then(() => {
                    onSelect({ projectId: p.id, jobId: job.id })
                    onRefetch()
                  })
                  .catch((e: Error) => toast(`Nu s-a șters: ${e.message}`))
              }}
            />
          </div>
        </div>
      </Card>

      {/* Livrabilele — toate celulele editabile cu click */}
      <Card className="space-y-1">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-base font-semibold">Livrabile</h3>
          <button
            onClick={() => setAdding((a) => !a)}
            className="rounded-full bg-[#DDEDDC] px-3 py-1 text-xs font-medium text-[#46862A] hover:bg-[#CBE3C9]"
          >
            + Livrabil
          </button>
        </div>

        {Math.round(weightSum) !== 100 && task.deliverables.length > 0 && (
          <p className="rounded-xl bg-[#FBF0D3] px-3 py-2 text-xs font-medium text-[#A87400]">
            Ponderile însumează {num(weightSum)}% — ajustează-le să dea 100%.
          </p>
        )}

        {/* capul de tabel */}
        <div className="grid grid-cols-[minmax(100px,1fr)_44px_128px_56px_56px_80px_28px] items-center gap-2 px-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
          <span>Livrabil</span>
          <span>UM</span>
          <span>Realizat / Total</span>
          <span className="text-right">Pond.</span>
          <span className="text-right" title="Oameni-zile planificați">
            O-zile
          </span>
          <span>Progres</span>
          <span />
        </div>

        <div className="divide-y divide-[#F3F1EC]">
          {task.deliverables.map((d) => {
            const dp = deliverablePct(Number(d.qty_done), Number(d.qty_total))
            return (
              <div
                key={d.id}
                className="grid grid-cols-[minmax(100px,1fr)_44px_128px_56px_56px_80px_28px] items-center gap-2 px-1 py-2 text-sm"
              >
                <InlineEdit
                  value={d.name}
                  onSave={(raw) => {
                    if (raw) saveDeliv(d, 'name', raw)
                  }}
                />
                <InlineEdit
                  value={d.um}
                  onSave={(raw) => {
                    if (raw) saveDeliv(d, 'um', raw)
                  }}
                  className="text-[#5B6673]"
                />
                <span className="whitespace-nowrap tabular-nums">
                  <InlineEdit
                    type="number"
                    value={String(d.qty_done)}
                    display={<strong>{num(Number(d.qty_done))}</strong>}
                    onSave={(raw) => saveDeliv(d, 'qty_done', raw)}
                    inputClassName="w-16 text-right"
                  />{' '}
                  <span className="text-[#C9C5BC]">/</span>{' '}
                  <InlineEdit
                    type="number"
                    value={String(d.qty_total)}
                    display={<span>{num(Number(d.qty_total))}</span>}
                    onSave={(raw) => saveDeliv(d, 'qty_total', raw)}
                    inputClassName="w-16 text-right"
                  />
                </span>
                <InlineEdit
                  type="number"
                  value={String(d.weight)}
                  display={<span className="block text-right">{num(Number(d.weight))}%</span>}
                  onSave={(raw) => saveDeliv(d, 'weight', raw)}
                  inputClassName="w-14 text-right"
                  className="text-right"
                />
                <InlineEdit
                  type="number"
                  value={d.planned_man_days == null ? '' : String(d.planned_man_days)}
                  placeholder="—"
                  display={
                    <span className="block text-right">
                      {d.planned_man_days == null ? '—' : num(Number(d.planned_man_days))}
                    </span>
                  }
                  onSave={(raw) => saveDeliv(d, 'planned_man_days', raw)}
                  inputClassName="w-14 text-right"
                  className="text-right"
                />
                <div className="flex items-center gap-1.5">
                  <ProgressBar
                    donePct={dp}
                    planPct={targetLine ?? undefined}
                    className="w-14 shrink-0 !h-1.5"
                  />
                  <span className="text-xs tabular-nums text-[#5B6673]">{pct(dp, 0)}</span>
                </div>
                <DangerButton label="✕" armedLabel="!" onConfirmed={() => removeDeliv(d.id)} className="!px-2 !py-1 text-xs" />
              </div>
            )
          })}
        </div>

        {adding && (
          <div className="grid grid-cols-[minmax(100px,1fr)_44px_80px_56px_56px_auto] items-center gap-2 rounded-xl bg-[#FAF9F6] p-2">
            <input
              autoFocus
              className={addInputCls}
              placeholder="Numele livrabilului"
              value={newRow.name}
              onChange={(e) => setNewRow((r) => ({ ...r, name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            />
            <input
              className={addInputCls}
              placeholder="UM"
              value={newRow.um}
              onChange={(e) => setNewRow((r) => ({ ...r, um: e.target.value }))}
            />
            <input
              className={addInputCls}
              placeholder="Total"
              inputMode="decimal"
              value={newRow.total}
              onChange={(e) => setNewRow((r) => ({ ...r, total: e.target.value }))}
            />
            <input
              className={addInputCls}
              placeholder={`${Math.max(0, 100 - Math.round(weightSum))}%`}
              inputMode="decimal"
              value={newRow.weight}
              onChange={(e) => setNewRow((r) => ({ ...r, weight: e.target.value }))}
              onFocus={() => {
                if (newRow.weight === '')
                  setNewRow((r) => ({ ...r, weight: String(Math.max(0, 100 - Math.round(weightSum))) }))
              }}
            />
            <input
              className={addInputCls}
              placeholder="O-Z"
              inputMode="decimal"
              value={newRow.manDays}
              onChange={(e) => setNewRow((r) => ({ ...r, manDays: e.target.value }))}
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => void saveNewDeliv()}
                className="rounded-full bg-[#58A834] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#46862A]"
              >
                Adaugă
              </button>
              <button
                onClick={() => setAdding(false)}
                className="rounded-full bg-[#EEECE7] px-3 py-1.5 text-xs font-medium"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <p className="pt-1 text-sm text-[#5B6673]">
          <strong className="text-[#0D1A2D]">{pct(pctDone)}</strong> din valoarea taskului realizată
          · orice celulă se editează cu click
        </p>
      </Card>

      {/* Ținta de efort (oameni-zile) */}
      {plannedMd !== null && plannedMd > 0 && (
        <Card className="!bg-[#FAF9F6]">
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
        </Card>
      )}
    </div>
  )
}

// ── Panoul Detaliu (comutatorul) ─────────────────────────────────────────
export function DetailPanel({
  projects,
  project,
  job,
  task,
  save,
  onRefetch,
  onSelect,
  onOpenCronologic,
}: {
  projects: ProjectWithKpis[]
  project: ProjectWithKpis | undefined
  job: JobWithKpis | undefined
  task: TaskRow | undefined
  save: Save
  onRefetch: () => void
  onSelect: (sel: Selection) => void
  onOpenCronologic: (projectId: string, jobId: string) => void
}) {
  const active = projects.filter((p) => p.active)
  return (
    <div className="flex min-h-0 min-w-[360px] flex-1 flex-col">
      <div className="mb-2 flex h-8 items-center px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5B6673]">
          Detaliu
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!project && (
          <div className="space-y-3">
            <Card className="py-8 text-center">
              <p className="font-medium">Alege un proiect din stânga</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-[#5B6673]">
                Calea proiect → job → task se deschide în coloane, iar aici editezi
                nivelul selectat. {active.length === 0 ? 'Începe cu „+ Proiect".' : ''}
              </p>
            </Card>
            <CumSeCalculeaza />
          </div>
        )}
        {project && !job && (
          <ProjectDetail p={project} save={save} onRefetch={onRefetch} onSelect={onSelect} />
        )}
        {project && job && !task && (
          <JobDetail
            p={project}
            job={job}
            save={save}
            onRefetch={onRefetch}
            onSelect={onSelect}
            onOpenCronologic={onOpenCronologic}
          />
        )}
        {project && job && task && (
          <TaskDetail
            p={project}
            job={job}
            task={task}
            save={save}
            onRefetch={onRefetch}
            onSelect={onSelect}
          />
        )}
      </div>
    </div>
  )
}
