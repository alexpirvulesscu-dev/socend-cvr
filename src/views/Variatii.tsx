// Registrul de variații (lucrări suplimentare), în limbajul Clean Ledger:
// pastile de totaluri → taburi cu numărători → UN singur tabel (cap, rânduri,
// subsol). Aceeași componentă se folosește și în pagina unui proiect: cu
// `projectId` filtrează un singur proiect, cu `embedded` renunță la antet.
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
import { DASH, compactLei, dataRo, lei, pct, toNum } from '../lib/format'
import {
  Card,
  DangerButton,
  EmptyState,
  GhostButton,
  NeutralPill,
  Pill,
  PrimaryButton,
  SegmentedControl,
  TableFooter,
  TableHead,
  TableRow,
} from '../components/ui'
import { InlineEdit } from '../components/InlineEdit'
import { toast } from '../components/Toast'
import { PageHeader, lunaCurenta } from '../components/Shell'

type Tab = 'toate' | VariationStatus

/** Statusul e singurul moment de culoare al rândului: aprobat / în așteptare / respins. */
const STATUS_TONE: Record<VariationStatus, string> = {
  aprobata: 'bg-pos-bg text-pos-pill',
  in_asteptare: 'bg-warn-bg text-warn-pill',
  respinsa: 'bg-neg-bg text-neg-pill',
}

// Lățimile coloanelor, ținute într-un singur loc ca antetul și rândurile să nu
// se desincronizeze (tabelul e construit din flex, nu din <table>).
const COL = {
  ref: 'w-[68px] shrink-0 sticky left-0 bg-paper-0',
  proj: 'w-[160px] shrink-0 truncate',
  desc: 'min-w-[200px] flex-1',
  date: 'w-[80px] shrink-0',
  amount: 'w-[140px] shrink-0 text-right',
  status: 'w-[124px] shrink-0',
  act: 'w-[40px] shrink-0 text-right',
}

const inputCls =
  'w-full rounded-btn border border-line-2 bg-paper-0 px-2.5 py-2 text-row text-ink-1 transition-colors duration-[120ms] ease-std hover:border-line-3 focus:border-accent'

export function VariatiiView({
  projects,
  variations,
  patchVariation,
  addLocal,
  openNewOnMount,
  projectId,
  embedded,
}: {
  projects: ProjectWithKpis[]
  variations: VariationRow[]
  patchVariation: (id: string, next: Partial<VariationRow> | null) => void
  addLocal: (v: VariationRow) => void
  openNewOnMount?: boolean
  /** doar variațiile acestui proiect; formularul îl are deja ales */
  projectId?: string
  /** montat într-o pagină de proiect: fără antet de pagină și fără pastila de lună */
  embedded?: boolean
}) {
  const today = todayIso()
  const [tab, setTab] = useState<Tab>('toate')
  const [adding, setAdding] = useState(Boolean(openNewOnMount))
  const [busy, setBusy] = useState(false)
  const active = useMemo(() => projects.filter((p) => p.active), [projects])
  const [draft, setDraft] = useState({
    projectId: projectId ?? '',
    description: '',
    amount: '',
    submittedDate: today,
  })

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects])

  // Domeniul de calcul: un singur proiect când e cerut, altfel toate cele active.
  const scoped = useMemo(
    () => (projectId ? variations.filter((v) => v.project_id === projectId) : variations),
    [variations, projectId]
  )
  const scopeProjects = useMemo(
    () => (projectId ? projects.filter((p) => p.id === projectId) : active),
    [projects, active, projectId]
  )
  const vt = variationTotals(scoped)

  // „dacă toate cele în așteptare intră": presupune că lucrarea e deja făcută și
  // lipsește doar aprobarea, deci suma se adaugă la venit, nu și la cost
  const ev = scopeProjects.reduce((s, p) => s + p.kpis.ev, 0)
  const cost = scopeProjects.reduce((s, p) => s + p.kpis.actualCost, 0)
  const marginNow = ev > 0 ? (ev - cost) / ev : 0
  const marginIfLand = marginIfPendingLand(ev, vt.pending, cost)

  const shown = useMemo(
    () => (tab === 'toate' ? scoped : scoped.filter((v) => v.status === tab)),
    [scoped, tab]
  )

  async function saveNew() {
    const pid = projectId ?? draft.projectId
    if (!pid || !draft.description.trim()) {
      toast('Alege proiectul și scrie o descriere.')
      return
    }
    setBusy(true)
    try {
      const row = await addVariation(
        {
          projectId: pid,
          description: draft.description.trim(),
          amount: toNum(draft.amount),
          submittedDate: draft.submittedDate,
        },
        variations
      )
      addLocal(row)
      setAdding(false)
      setDraft({ projectId: projectId ?? '', description: '', amount: '', submittedDate: today })
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

  const newButton = <PrimaryButton onClick={() => setAdding((a) => !a)}>Variație nouă</PrimaryButton>

  const tabs: { value: Tab; label: string }[] = [
    { value: 'toate', label: `Toate · ${scoped.length}` },
    { value: 'in_asteptare', label: `În așteptare · ${vt.pendingCount}` },
    { value: 'aprobata', label: `Aprobate · ${vt.approvedCount}` },
    { value: 'respinsa', label: `Respinse · ${vt.rejectedCount}` },
  ]

  return (
    <div className={embedded ? '' : 'mx-auto max-w-[1500px] px-8 py-6'}>
      {!embedded && (
        <PageHeader title="Variații" pill={lunaCurenta(today)} action={newButton} />
      )}

      {/* pastilele de totaluri — verde câștigat, chihlimbar în așteptare, roșu respins */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Pill tone="pos">
          Aprobate {vt.approved >= 0 ? '+' : ''}
          {lei(vt.approved)}
        </Pill>
        <Pill tone="warn">
          În așteptare {vt.pending >= 0 ? '+' : ''}
          {lei(vt.pending)}
        </Pill>
        <Pill tone="neg">Respinse {lei(vt.rejected)}</Pill>
        {vt.pendingCount > 0 && ev > 0 && (
          <span title="Presupune că lucrarea e deja făcută și lipsește doar aprobarea">
            <NeutralPill>
              Dacă toate cele în așteptare intră: marjă {pct(marginIfLand)} (acum {pct(marginNow)})
            </NeutralPill>
          </span>
        )}
      </div>

      {/* taburile cu numărători */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl options={tabs} value={tab} onChange={setTab} />
        {embedded && newButton}
      </div>

      {/* formularul de adăugare */}
      {adding && (
        <Card className="mb-3 !p-4">
          <div
            className={`grid grid-cols-1 gap-3 ${
              projectId
                ? 'md:grid-cols-[2fr_140px_150px_auto]'
                : 'md:grid-cols-[1fr_2fr_140px_150px_auto]'
            }`}
          >
            {!projectId && (
              <select
                value={draft.projectId}
                onChange={(e) => setDraft((d) => ({ ...d, projectId: e.target.value }))}
                className={`${inputCls} cursor-pointer`}
                aria-label="Proiect"
              >
                <option value="">Alege proiectul…</option>
                {active.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
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
              <PrimaryButton disabled={busy} onClick={() => void saveNew()}>
                Adaugă
              </PrimaryButton>
              <GhostButton onClick={() => setAdding(false)}>Renunță</GhostButton>
            </div>
          </div>
          <p className="mt-2 text-sub text-ink-3">
            Suma poate fi negativă, dacă variația scade valoarea contractului.
          </p>
        </Card>
      )}

      {/* tabelul */}
      <Card className="overflow-hidden !p-0">
        <div className={shown.length === 0 ? 'hidden' : 'overflow-x-auto'}>
          <div className={projectId ? 'min-w-[760px]' : 'min-w-[940px]'}>
            <TableHead>
              <span className={COL.ref}>Ref</span>
              {!projectId && <span className={COL.proj}>Proiect</span>}
              <span className={COL.desc}>Descriere</span>
              <span className={COL.date}>Trimis</span>
              <span className={COL.amount}>Sumă</span>
              <span className={COL.status}>Status</span>
              <span className={COL.act} />
            </TableHead>

            {shown.map((v) => (
              <TableRow key={v.id}>
                <span className={`${COL.ref} font-semibold text-ink-1`}>{v.ref}</span>
                {!projectId && (
                  <span className={`${COL.proj} text-ink-2`}>{byId.get(v.project_id) ?? DASH}</span>
                )}
                <span className={`${COL.desc} text-ink-1`}>
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
                </span>
                <span className={`${COL.date} text-ink-3`}>{dataRo(v.submitted_date)}</span>
                <span className={`${COL.amount} font-bold tabular-nums`}>
                  <InlineEdit
                    type="number"
                    value={String(v.amount)}
                    display={
                      <span className={v.amount < 0 ? 'text-neg' : 'text-ink-1'}>
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
                </span>
                <span className={COL.status}>
                  {/* pastilă la vedere, select dedesubt: culoarea și caretul vin din tonul statusului */}
                  <span
                    className={`relative inline-flex items-center rounded-full border border-transparent transition-colors duration-[120ms] ease-std hover:border-current ${STATUS_TONE[v.status]}`}
                  >
                    <select
                      value={v.status}
                      onChange={(e) => changeStatus(v, e.target.value as VariationStatus)}
                      aria-label="Status"
                      className="cursor-pointer appearance-none rounded-full bg-transparent py-1 pl-2.5 pr-6 text-pill font-semibold text-inherit"
                    >
                      {(Object.keys(VARIATION_STATUS_LABELS) as VariationStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {VARIATION_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden className="pointer-events-none absolute right-2 text-meta">
                      ▾
                    </span>
                  </span>
                </span>
                <span className={COL.act}>
                  <DangerButton
                    label="✕"
                    armedLabel="Sigur?"
                    className="!px-2 !py-1"
                    onConfirmed={() => {
                      patchVariation(v.id, null)
                      deleteVariation(v.id).catch((e: Error) => toast(`Nu s-a șters: ${e.message}`))
                    }}
                  />
                </span>
              </TableRow>
            ))}
          </div>
        </div>

        {shown.length === 0 &&
          (scoped.length === 0 ? (
            <EmptyState title="Nicio variație încă" action={newButton}>
              Apasă „Variație nouă" ca să înregistrezi prima lucrare suplimentară.
            </EmptyState>
          ) : (
            <EmptyState title="Nimic în acest filtru">
              Schimbă tabul ca să vezi celelalte variații.
            </EmptyState>
          ))}

        {scoped.length > 0 && (
          <TableFooter>
            <span>
              <span className="text-ink-3">Aprobate în perioadă: </span>
              <strong className="font-bold text-pos">
                {vt.approved >= 0 ? '+' : ''}
                {lei(vt.approved)}
              </strong>
              <span className="ml-4 text-ink-3">Așteaptă decizie: </span>
              <strong className="font-bold text-warn">
                {vt.pending >= 0 ? '+' : ''}
                {lei(vt.pending)}
              </strong>
            </span>
            <span className="text-ink-3">
              {scoped.length} {scoped.length === 1 ? 'variație' : 'variații'} ·{' '}
              {compactLei(vt.approved + vt.pending)} în joc
            </span>
          </TableFooter>
        )}
      </Card>
    </div>
  )
}
