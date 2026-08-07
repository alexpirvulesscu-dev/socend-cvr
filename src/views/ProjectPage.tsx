// Pagina unui proiect. Intri din lista de proiecte și ai TOT proiectul aici:
// cifrele lui sus, apoi sub-taburile Prezentare · Costuri · Variații · Program ·
// Documente. Lista de proiecte rămâne în urmă (butonul „Proiecte" te întoarce).
import { useMemo, useState } from 'react'
import type { EntityPatch, ProjectWithKpis } from '../data/projects'
import { todayIso } from '../data/projects'
import type { VariationRow } from '../data/variations'
import { makeSave } from '../data/save'
import { hoursOf, manDaysToHours, useLabourHours } from '../data/labour'
import {
  cashColor,
  costColor,
  marginColor,
  scheduleColor,
} from '../domain/kpi'
import { labourVerdict, plannedHours } from '../domain/labour'
import { compact, dataRo, num, pct } from '../lib/format'
import {
  Card,
  EmptyState,
  Pill,
  SegmentedControl,
  StatCard,
  BackLink,
  scheduleText,
  toneOf,
  type Tone,
} from '../components/ui'
import { PageHeader } from '../components/Shell'
import type { Selection } from '../lib/selection'
import { GanttChart } from '../components/gantt/GanttChart'
import { VariatiiView } from './Variatii'
import { CosturiProiect } from './project/Costuri'
import { ManoperaProiect } from './project/Manopera'
import { StructuraProiect } from './project/Structura'

type SubTab = 'prezentare' | 'manopera' | 'costuri' | 'variatii' | 'program' | 'documente'

/** Verdictul proiectului — aceeași regulă ca pe cardul din listă. */
function verdict(p: ProjectWithKpis): { label: string; tone: Tone } {
  if (!p.active) return { label: 'Finalizat', tone: 'neutral' }
  if (p.kpis.ev <= 0) return { label: 'Nu a început', tone: 'neutral' }
  if (p.kpis.margin < 0) return { label: 'Pierde bani', tone: 'neg' }
  if (p.kpis.behindDays >= 7 || p.kpis.margin < 0.08 || p.kpis.costVariance < 0)
    return { label: 'De urmărit', tone: 'warn' }
  return { label: 'Conform planului', tone: 'pos' }
}

/** Verdictul orelor, în tonurile aplicației: peste plan = roșu, aproape = ambru. */
function oreTone(v: ReturnType<typeof labourVerdict>): Tone {
  if (v === 'peste_plan') return 'neg'
  if (v === 'aproape') return 'warn'
  if (v === 'sub_plan') return 'pos'
  return 'neutral'
}

/** „PT2" din „Punct Termic 2 (PT2)" — eticheta scurtă pentru note. */
function shortJobName(name: string): string {
  return name.match(/\(([^)]+)\)/)?.[1] ?? name
}

/** Cele cinci întrebări la care răspunde proiectul. */
function CifreProiect({ p, ore }: { p: ProjectWithKpis; ore: number }) {
  // planul de ore: numărul proiectului, altfel suma joburilor (0023)
  const orePlan = plannedHours({
    declared: p.planned_hours === null ? null : Number(p.planned_hours),
    children: p.jobs.map((j) =>
      plannedHours({
        declared: j.planned_hours === null ? null : Number(j.planned_hours),
        children: j.tasks.map((t) => manDaysToHours(t.planned_man_days)),
      })
    ),
  })
  const k = p.kpis
  const shouldCost = k.costVariance + k.actualCost
  const worst = [...p.jobs].sort((a, b) => b.kpis.behindDays - a.kpis.behindDays)[0]
  const behindCount = p.jobs.filter((j) => j.kpis.behindDays >= 2).length
  const lateLei = Math.round(k.scheduleVarianceLei)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        label="Cât s-a construit?"
        value={pct(k.donePct)}
        pills={[{ text: `${compact(k.ev)} din ${compact(Number(p.contract_value))} lei` }]}
      />
      <StatCard
        label="În avans sau în urmă?"
        value={scheduleText(k.behindDays)}
        tone={toneOf(scheduleColor(k.behindDays))}
        pills={[
          {
            text:
              !worst || worst.kpis.behindDays < 2
                ? 'toate joburile conform planului'
                : `cel mai în urmă: ${shortJobName(worst.name)}`,
          },
          ...(behindCount > 1 ? [{ text: `${behindCount} joburi în urmă` }] : []),
        ]}
        footnote={
          lateLei > 0 ? `muncă de ${compact(lateLei)} lei trebuia executată până azi` : undefined
        }
      />
      <StatCard
        label="A costat cât am planificat?"
        value={`${k.costVariance >= 0 ? '+' : ''}${compact(k.costVariance)}`}
        tone={toneOf(costColor(k.costVariance))}
        pills={[
          { text: `trebuia ${compact(shouldCost)}` },
          { text: `a costat ${compact(k.actualCost)}` },
        ]}
        footnote={k.eacCost !== null ? `la final estimăm ~${compact(k.eacCost)} lei` : undefined}
      />
      <StatCard
        label="Câștigăm bani?"
        value={pct(k.margin)}
        tone={k.ev > 0 ? toneOf(marginColor(k.margin)) : 'neutral'}
        pills={[{ text: 'din fiecare leu executat' }]}
        footnote={
          k.forecastMargin !== null ? `la final ~${pct(k.forecastMargin)} în ritmul actual` : undefined
        }
      />
      <StatCard
        label="Unde sunt banii?"
        value={`${pct(k.cashPct)} încasat`}
        tone={toneOf(cashColor(k.cashPct))}
        pills={[{ text: `${compact(k.billing.incasat)} din ${compact(k.billing.facturat)}` }]}
        footnote={k.wip > 0 ? `${compact(k.wip)} lei construiți și neprobați` : undefined}
      />
      <StatCard
        label="Cât am muncit?"
        value={`${num(ore)} ore`}
        tone={orePlan > 0 ? oreTone(labourVerdict(orePlan, ore)) : 'neutral'}
        pills={[{ text: orePlan > 0 ? `din ${num(orePlan)} planificate` : 'fără plan de ore' }]}
        footnote={
          orePlan > 0
            ? `${pct(ore / orePlan)} din orele alocate · detaliul în fila Manoperă`
            : 'orele vin din Pontaj · pune un plan în fila Manoperă'
        }
      />
    </div>
  )
}

export function ProjectPageView({
  p,
  sel,
  onSelect,
  onBack,
  onRefetch,
  patchEntity,
  variations,
  patchVariation,
  addLocal,
  onOpenCronologic,
}: {
  p: ProjectWithKpis
  sel: Selection
  onSelect: (sel: Selection) => void
  onBack: () => void
  onRefetch: () => void
  patchEntity: (patch: EntityPatch) => void
  variations: VariationRow[]
  patchVariation: (id: string, next: Partial<VariationRow> | null) => void
  addLocal: (v: VariationRow) => void
  onOpenCronologic: (projectId: string, jobId: string) => void
}) {
  const [tab, setTab] = useState<SubTab>('prezentare')
  const save = useMemo(() => makeSave(patchEntity), [patchEntity])
  // orele reale din Pontaj (deocamdată doar pe proiect)
  const { hours } = useLabourHours()
  const v = verdict(p)

  const variatiiProiect = variations.filter((x) => x.project_id === p.id)
  const inAsteptare = variatiiProiect.filter((x) => x.status === 'in_asteptare').length

  const perioada =
    p.start_date && p.end_date ? `${dataRo(p.start_date)} – ${dataRo(p.end_date)}` : null

  return (
    <div className="mx-auto max-w-[1600px] px-8 py-6">
      <PageHeader
        title={p.name}
        back={<BackLink label="Proiecte" onClick={onBack} />}
        pill={<Pill tone={v.tone}>{v.label}</Pill>}
      />

      <p className="-mt-3 mb-4 text-row text-ink-3">
        {[p.client, perioada, `${pct(p.kpis.donePct)} realizat`].filter(Boolean).join(' · ')}
      </p>

      <div className="mb-5 overflow-x-auto">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'prezentare', label: 'Prezentare' },
            { value: 'manopera', label: 'Manoperă' },
            { value: 'costuri', label: 'Costuri' },
            {
              value: 'variatii',
              label: inAsteptare > 0 ? `Variații · ${inAsteptare}` : 'Variații',
            },
            { value: 'program', label: 'Program' },
            { value: 'documente', label: 'Documente' },
          ]}
        />
      </div>

      {/* cele cinci cifre stau pe „Prezentare"; celelalte sub-taburi au
          numerele lor și nu au nevoie să le repete */}
      {tab === 'prezentare' && (
        <div className="mb-5">
          <CifreProiect p={p} ore={hoursOf(hours, p.id).total} />
        </div>
      )}

      {tab === 'prezentare' && (
        <StructuraProiect
          p={p}
          sel={sel}
          onSelect={onSelect}
          save={save}
          onRefetch={onRefetch}
          patchEntity={patchEntity}
          onOpenCronologic={onOpenCronologic}
          hours={hours}
        />
      )}

      {tab === 'manopera' && <ManoperaProiect p={p} save={save} hours={hours} />}

      {tab === 'costuri' && (
        <CosturiProiect p={p} save={save} hours={hoursOf(hours, p.id).total || null} />
      )}

      {tab === 'variatii' && (
        <VariatiiView
          projects={[p]}
          variations={variations}
          patchVariation={patchVariation}
          addLocal={addLocal}
          projectId={p.id}
          embedded
        />
      )}

      {tab === 'program' && (
        <div style={{ height: 'clamp(420px, calc(100vh - 420px), 760px)' }}>
          <GanttChart
            projects={[p]}
            focusProjectId={p.id}
            onFocusProject={() => {}}
            patchEntity={patchEntity}
            today={todayIso()}
            embedded
          />
        </div>
      )}

      {tab === 'documente' && (
        <Card className="!p-0">
          <EmptyState title="Documentele vin mai târziu">
            Aici vor sta contractul, situațiile semnate și dispozițiile de șantier ale
            proiectului. Deocamdată nu se încarcă fișiere în CVR.
          </EmptyState>
        </Card>
      )}
    </div>
  )
}
