// Registrul de variații (lucrări suplimentare) — după referința de design:
// pastile de filtrare cu totaluri, taburi cu numărători, tabel, totaluri jos.
import { useMemo, useState } from 'react'
import type { ProjectWithKpis } from '../data/projects'
import { todayIso } from '../data/projects'
import {
  VARIATION_STATUS_LABELS,
  addVariation,
  deleteVariation,
  setVariationStatus,
  updateVariation,
  variationTotals,
  type VariationRow,
  type VariationStatus,
} from '../data/variations'
import { marginIfPendingLand } from '../domain/kpi'
import { compact, dataRo, lei, pct, toNum } from '../lib/format'
import { Card, DangerButton } from '../components/ui'
import { InlineEdit } from '../components/InlineEdit'
import { toast } from '../components/Toast'
import { PageHeader, PrimaryButton, lunaCurenta } from '../components/Shell'

type Tab = 'toate' | VariationStatus

const STATUS_PILL: Record<VariationStatus, string> = {
  aprobata: 'bg-[#DDEDDC] text-[#46862A]',
  in_asteptare: 'bg-[#FBF0D3] text-[#A87400]',
  respinsa: 'bg-[#F8DEDE] text-[#B23A3A]',
}

const inputCls =
  'w-full rounded-lg border border-[#E8E8E8] bg-white px-2.5 py-2 text-sm outline-none focus:border-[#58A834]'

export function VariatiiView({
  projects,
  variations,
  patchVariation,
  addLocal,
  openNewOnMount,
}: {
  projects: ProjectWithKpis[]
  variations: VariationRow[]
  patchVariation: (id: string, next: Partial<VariationRow> | null) => void
  addLocal: (v: VariationRow) => void
  openNewOnMount?: boolean
}) {
  const today = todayIso()
  const [tab, setTab] = useState<Tab>('toate')
  const [adding, setAdding] = useState(Boolean(openNewOnMount))
  const [busy, setBusy] = useState(false)
  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const [draft, setDraft] = useState({
    projectId: '',
    description: '',
    amount: '',
    submittedDate: today,
  })

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])
  const vt = variationTotals(variations)

  // „dacă toate cele în așteptare intră": presupune că lucrarea e deja făcută și
  // lipsește doar aprobarea, deci suma se adaugă la venit, nu și la cost
  const ev = active.reduce((s, p) => s + p.kpis.ev, 0)
  const cost = active.reduce((s, p) => s + p.kpis.actualCost, 0)
  const marginNow = ev > 0 ? (ev - cost) / ev : 0
  const marginIfLand = marginIfPendingLand(ev, vt.pending, cost)

  const shown = useMemo(
    () => (tab === 'toate' ? variations : variations.filter((v) => v.status === tab)),
    [variations, tab]
  )

  async function saveNew() {
    if (!draft.projectId || !draft.description.trim()) {
      toast('Alege proiectul și scrie o descriere.')
      return
    }
    setBusy(true)
    try {
      const row = await addVariation(
        {
          projectId: draft.projectId,
          description: draft.description.trim(),
          amount: toNum(draft.amount),
          submittedDate: draft.submittedDate,
        },
        variations
      )
      addLocal(row)
      setAdding(false)
      setDraft({ projectId: '', description: '', amount: '', submittedDate: today })
    } catch (e) {
      toast(`Variația nu s-a creat: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  /** Schimbă statusul optimist; la eroare revine și anunță. */
  function changeStatus(v: VariationRow, status: VariationStatus) {
    const prev = { status: v.status, decided_date: v.decided_date }
    patchVariation(v.id, {
      status,
      decided_date: status === 'in_asteptare' ? null : today,
    })
    setVariationStatus(v.id, status).catch((e: Error) => {
      patchVariation(v.id, prev)
      toast(`Nu s-a salvat: ${e.message}`)
    })
  }

  const tabBtn = (key: Tab, label: string, count: number) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
        tab === key
          ? 'bg-white text-[#0D1A2D] shadow-[0_1px_2px_rgba(13,26,45,0.06)]'
          : 'text-[#5B6673] hover:text-[#0D1A2D]'
      }`}
    >
      {label} · {count}
    </button>
  )

  return (
    <div className="mx-auto max-w-[1500px] px-8 py-6">
      <PageHeader
        title="Variații"
        pill={lunaCurenta(today)}
        action={<PrimaryButton onClick={() => setAdding((a) => !a)}>Variație nouă</PrimaryButton>}
      />

      {/* pastilele de totaluri */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-[#DDEDDC] px-3.5 py-1.5 text-sm font-medium text-[#46862A]">
          Aprobate {vt.approved >= 0 ? '+' : ''}
          {lei(vt.approved)}
        </span>
        <span className="rounded-full bg-[#FBF0D3] px-3.5 py-1.5 text-sm font-medium text-[#A87400]">
          În așteptare {vt.pending >= 0 ? '+' : ''}
          {lei(vt.pending)}
        </span>
        <span className="rounded-full bg-[#F8DEDE] px-3.5 py-1.5 text-sm font-medium text-[#B23A3A]">
          Respinse {lei(vt.rejected)}
        </span>
        {vt.pendingCount > 0 && ev > 0 && (
          <span
            className="rounded-full bg-[#EEECE7] px-3.5 py-1.5 text-sm font-medium text-[#5B6673]"
            title="Presupune că lucrarea e deja făcută și lipsește doar aprobarea"
          >
            Dacă toate cele în așteptare intră: marjă {pct(marginIfLand)} (acum {pct(marginNow)})
          </span>
        )}
      </div>

      {/* taburi */}
      <div className="mb-3 inline-flex gap-1 rounded-2xl bg-[#F1EEE9] p-1">
        {tabBtn('toate', 'Toate', variations.length)}
        {tabBtn('in_asteptare', 'În așteptare', vt.pendingCount)}
        {tabBtn('aprobata', 'Aprobate', vt.approvedCount)}
        {tabBtn('respinsa', 'Respinse', vt.rejectedCount)}
      </div>

      {/* formularul de adăugare */}
      {adding && (
        <Card className="mb-3 !p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_140px_150px_auto]">
            <select
              value={draft.projectId}
              onChange={(e) => setDraft((d) => ({ ...d, projectId: e.target.value }))}
              className={inputCls}
              aria-label="Proiect"
            >
              <option value="">Alege proiectul…</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              autoFocus
              className={inputCls}
              placeholder="Descriere (ex. Săpătură în stâncă, ch. 240–410)"
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveNew()
                if (e.key === 'Escape') setAdding(false)
              }}
            />
            <input
              className={inputCls}
              placeholder="Sumă (lei)"
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
            />
            <input
              type="date"
              className={inputCls}
              value={draft.submittedDate}
              onChange={(e) => setDraft((d) => ({ ...d, submittedDate: e.target.value }))}
              aria-label="Data trimiterii"
            />
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => void saveNew()}
                className="rounded-xl bg-[#2C6E36] px-4 py-2 text-sm font-semibold text-white hover:bg-[#255C2D] disabled:opacity-40"
              >
                Adaugă
              </button>
              <button
                onClick={() => setAdding(false)}
                className="rounded-xl bg-[#EEECE7] px-3 py-2 text-sm font-medium"
              >
                Renunță
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-[#5B6673]">
            Suma poate fi negativă, dacă variația scade valoarea contractului.
          </p>
        </Card>
      )}

      {/* tabelul */}
      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse">
            <thead>
              <tr className="border-b border-[#E8E8E8] text-left text-xs text-[#5B6673]">
                <th className="px-5 py-3 font-medium">Ref</th>
                <th className="px-5 py-3 font-medium">Proiect</th>
                <th className="px-5 py-3 font-medium">Descriere</th>
                <th className="px-5 py-3 font-medium">Trimis</th>
                <th className="px-5 py-3 text-right font-medium">Sumă</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-[#5B6673]">
                    {variations.length === 0
                      ? 'Nicio variație încă. Apasă „Variație nouă" ca să înregistrezi prima lucrare suplimentară.'
                      : 'Nimic în acest filtru.'}
                  </td>
                </tr>
              )}
              {shown.map((v) => (
                <tr key={v.id} className="border-b border-[#F3F1EC] last:border-0 hover:bg-[#FAF9F6]">
                  <td className="px-5 py-3.5 text-sm font-semibold tabular-nums">{v.ref}</td>
                  <td className="px-5 py-3.5 text-sm text-[#5B6673]">
                    {byId.get(v.project_id) ?? '—'}
                  </td>
                  <td className="px-5 py-3.5 text-sm">
                    <InlineEdit
                      value={v.description}
                      onSave={(raw) => {
                        if (!raw) return
                        const prev = v.description
                        patchVariation(v.id, { description: raw })
                        updateVariation(v.id, { description: raw }).catch((e: Error) => {
                          patchVariation(v.id, { description: prev })
                          toast(`Nu s-a salvat: ${e.message}`)
                        })
                      }}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[#5B6673]">{dataRo(v.submitted_date)}</td>
                  <td className="px-5 py-3.5 text-right text-sm font-semibold tabular-nums">
                    <InlineEdit
                      type="number"
                      value={String(v.amount)}
                      display={
                        <span className={v.amount < 0 ? 'text-[#D64545]' : ''}>
                          {v.amount >= 0 ? '+' : ''}
                          {lei(v.amount)}
                        </span>
                      }
                      onSave={(raw) => {
                        const next = toNum(raw)
                        const prev = v.amount
                        patchVariation(v.id, { amount: next })
                        updateVariation(v.id, { amount: next }).catch((e: Error) => {
                          patchVariation(v.id, { amount: prev })
                          toast(`Nu s-a salvat: ${e.message}`)
                        })
                      }}
                      inputClassName="w-28 text-right"
                    />
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={v.status}
                      onChange={(e) => changeStatus(v, e.target.value as VariationStatus)}
                      className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium outline-none ${STATUS_PILL[v.status]}`}
                    >
                      {(Object.keys(VARIATION_STATUS_LABELS) as VariationStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {VARIATION_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <DangerButton
                      label="✕"
                      armedLabel="Sigur?"
                      className="!px-2 !py-1 text-xs"
                      onConfirmed={() => {
                        patchVariation(v.id, null)
                        deleteVariation(v.id).catch((e: Error) =>
                          toast(`Nu s-a șters: ${e.message}`)
                        )
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {variations.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E8E8E8] px-5 py-3.5 text-sm">
            <span>
              <span className="text-[#5B6673]">Aprobate în perioadă: </span>
              <strong className="text-[#46862A]">
                {vt.approved >= 0 ? '+' : ''}
                {lei(vt.approved)}
              </strong>
              <span className="ml-4 text-[#5B6673]">Așteaptă decizie: </span>
              <strong className="text-[#A87400]">
                {vt.pending >= 0 ? '+' : ''}
                {lei(vt.pending)}
              </strong>
            </span>
            <span className="text-[#5B6673]">
              {variations.length} {variations.length === 1 ? 'variație' : 'variații'} ·{' '}
              {compact(vt.approved + vt.pending)} lei în joc
            </span>
          </div>
        )}
      </Card>
    </div>
  )
}
