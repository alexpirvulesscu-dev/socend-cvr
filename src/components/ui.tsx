// Componentele de bază ale sistemului Clean Ledger.
// Tot ce se vede în aplicație e construit din piesele de aici, ca să existe UN
// singur card, UN singur buton, UN singur fel de pastilă. Culorile vin din
// tokenii din index.css — în acest fișier (ca peste tot) nu se scrie hex.
import { useEffect, useState, type ReactNode } from 'react'
import type { KpiColor, TaskStatus } from '../domain/kpi'
import { STATUS_LABELS } from '../data/projects'
import { num, pct, zile } from '../lib/format'

// ── Tonuri ───────────────────────────────────────────────────────────────
// Culoarea e informație, niciodată decor: verde = bani câștigați / aprobat /
// conform planului, chihlimbar = în așteptare / în urmă, roșu = pierdem bani /
// respins / depășit. Restul rămâne neutru.
export type Tone = 'pos' | 'warn' | 'neg' | 'info' | 'neutral'

/** KPI-urile vorbesc în good/warning/error; aici traducem în tonurile de culoare. */
export function toneOf(c: KpiColor): Tone {
  return c === 'good' ? 'pos' : c === 'warning' ? 'warn' : 'neg'
}

const TONE_TEXT: Record<Tone, string> = {
  pos: 'text-pos',
  warn: 'text-warn',
  neg: 'text-neg',
  info: 'text-info',
  neutral: 'text-ink-1',
}

const TONE_PILL: Record<Tone, string> = {
  pos: 'bg-pos-bg text-pos-pill',
  warn: 'bg-warn-bg text-warn-pill',
  neg: 'bg-neg-bg text-neg-pill',
  info: 'bg-info-bg text-info',
  neutral: 'bg-segment text-ink-2',
}

const TONE_FILL: Record<Tone, string> = {
  pos: 'bg-pos-fill',
  warn: 'bg-warn-fill',
  neg: 'bg-neg-fill',
  info: 'bg-info-fill',
  neutral: 'bg-progress-neutral',
}

/** Clasa de text pentru o cifră cu verdict. */
export function toneText(t: Tone): string {
  return TONE_TEXT[t]
}

// ── Card ─────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = '',
  onClick,
  title,
  subtitle,
  action,
}: {
  children?: ReactNode
  className?: string
  onClick?: () => void
  /** titlul cardului (13,5px/600) */
  title?: ReactNode
  /** o singură propoziție care explică datele (11,5px, ink-3) */
  subtitle?: ReactNode
  /** acțiunea din colțul din dreapta sus */
  action?: ReactNode
}) {
  const head = title || action || subtitle
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`rounded-card border border-line-2 bg-paper-0 shadow-e1 ${
        onClick
          ? 'cursor-pointer transition-[box-shadow,transform] duration-[120ms] ease-std hover:-translate-y-px hover:shadow-e2'
          : ''
      } ${head ? '' : 'p-5'} ${className}`}
    >
      {head && (
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-card font-semibold text-ink-1">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-sub text-ink-3">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {head ? <div className="p-5 pt-3">{children}</div> : children}
    </div>
  )
}

// ── Cifre ────────────────────────────────────────────────────────────────

/**
 * Cartonașul de cifră: etichetă mică → cifra mare → pastile de context →
 * notă de subsol. Toate ecranele prezintă cifrele la fel.
 */
export function StatCard({
  label,
  value,
  tone = 'neutral',
  pills = [],
  footnote,
  hero = false,
  className = '',
}: {
  label: string
  /** de obicei text; poate fi și un câmp editabil (vezi fila Manoperă) */
  value: ReactNode
  tone?: Tone
  pills?: { text: string; tone?: Tone }[]
  footnote?: string
  /** cifrele mari de pe Dashboard */
  hero?: boolean
  className?: string
}) {
  return (
    <div
      className={`flex flex-col rounded-card border border-line-2 bg-paper-0 p-5 shadow-e1 ${className}`}
    >
      <p className="text-sub font-medium text-ink-3">{label}</p>
      <p
        className={`mt-1.5 font-bold tracking-[-0.02em] tabular-nums ${
          hero ? 'text-stat' : 'text-stat-sm'
        } ${TONE_TEXT[tone]}`}
      >
        {value}
      </p>
      {pills.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <Pill key={p.text} tone={p.tone ?? 'neutral'}>
              {p.text}
            </Pill>
          ))}
        </div>
      )}
      {footnote && <p className="mt-auto pt-3 text-sub text-ink-3">{footnote}</p>}
    </div>
  )
}

// ── Pastile ──────────────────────────────────────────────────────────────

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-pill font-semibold ${TONE_PILL[tone]}`}
    >
      {children}
    </span>
  )
}

/** Pastilă neutră — context fără verdict. */
export function NeutralPill({ children }: { children: ReactNode }) {
  return <Pill tone="neutral">{children}</Pill>
}

/** Pastilă de KPI (good/warning/error din domeniu). */
export function KpiPill({ color, children }: { color: KpiColor; children: ReactNode }) {
  return <Pill tone={toneOf(color)}>{children}</Pill>
}

/** Statusul unui task: informație de rutină, deci neutru. */
export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-segment px-2.5 py-1 text-pill font-semibold text-ink-2">
      {status === 'in_lucru' && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pos-fill" />
      )}
      {status === 'finalizat' && <span aria-hidden className="text-ink-3">✓</span>}
      {STATUS_LABELS[status]}
    </span>
  )
}

// ── Butoane ──────────────────────────────────────────────────────────────

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-btn px-[15px] py-[9px] text-row font-semibold transition-colors duration-[120ms] ease-std ${
        disabled
          ? 'cursor-not-allowed bg-line-2 text-ink-4'
          : 'bg-accent text-paper-0 hover:bg-accent-hover active:bg-accent-active'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  onClick,
  disabled,
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-btn border border-line-3 bg-paper-0 px-[15px] py-[9px] text-row font-semibold text-ink-2 transition-colors duration-[120ms] ease-std ${
        disabled ? 'cursor-not-allowed text-ink-4' : 'hover:bg-paper-1'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Ștergere cu confirmare prin dublă apăsare: prima apăsare îl transformă în
 * „Sigur? Apasă din nou", a doua execută. Fără dialoguri de browser.
 */
export function DangerButton({
  label,
  onConfirmed,
  className = '',
  armedLabel = 'Sigur? Apasă din nou',
}: {
  label: string
  onConfirmed: () => void
  className?: string
  armedLabel?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirmed()
        } else {
          setArmed(true)
        }
      }}
      // în repaus e discret (un buton roșu neapăsat = alarmă falsă);
      // roșul apare la hover și, plin, doar când e armat
      className={`rounded-btn px-3 py-2 text-row font-semibold transition-colors duration-[120ms] ease-std ${
        armed ? 'bg-neg text-paper-0' : 'text-ink-3 hover:bg-neg-bg hover:text-neg-pill'
      } ${className}`}
    >
      {armed ? armedLabel : label}
    </button>
  )
}

/** Săgeata de întoarcere din ecranele de detaliu. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-btn border border-line-3 bg-paper-0 px-3 py-1.5 text-row font-semibold text-ink-2 transition-colors duration-[120ms] ease-std hover:bg-paper-1"
    >
      <span aria-hidden>←</span> {label}
    </button>
  )
}

// ── Control segmentat ────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={`inline-flex gap-0.5 rounded-[11px] bg-segment p-[3px] ${className}`}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`rounded-chip px-3 py-1.5 text-row font-semibold transition-colors duration-[120ms] ease-std ${
              on ? 'bg-paper-0 text-ink-1 shadow-seg' : 'text-ink-3 hover:text-ink-1'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Bare (rails) ─────────────────────────────────────────────────────────

/**
 * Bara de progres: umplutura = realizat, liniuța = unde ar trebui să fim azi.
 * Fără verdict, umplutura e verde-stins (progress-neutral).
 */
export function ProgressBar({
  donePct,
  planPct,
  tone = 'neutral',
  className = '',
  title,
}: {
  donePct: number
  planPct?: number
  tone?: Tone
  className?: string
  title?: string
}) {
  const done = Math.min(Math.max(donePct, 0), 1) * 100
  const plan = planPct === undefined ? undefined : Math.min(Math.max(planPct, 0), 1) * 100
  const label =
    title ??
    (plan === undefined
      ? `Realizat ${pct(donePct)}`
      : `Realizat ${pct(donePct)} · plan ${pct(planPct ?? 0)}`)
  return (
    <div title={label} className={`relative h-2 rounded-full bg-track ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-[260ms] ease-std ${TONE_FILL[tone]}`}
        style={{ width: `${done}%` }}
      />
      {plan !== undefined && (
        <div
          aria-hidden
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-tick"
          style={{ left: `calc(${plan}% - 1px)` }}
        />
      )}
    </div>
  )
}

/**
 * Bara de marjă — componenta semnătură: marja reală față de reperul planificat,
 * pe o scară comună tuturor rândurilor. Apare oriunde comparăm o marjă cu planul.
 */
export function MarginRail({
  actual,
  planned,
  scaleMax,
  tone,
  className = '',
}: {
  /** marja reală, ca fracție (0,239 = 23,9%) */
  actual: number
  /** marja planificată, ca fracție; lipsă = fără reper */
  planned?: number | null
  /** capătul scării, ca fracție */
  scaleMax: number
  tone: Tone
  className?: string
}) {
  const max = Math.max(scaleMax, 0.01)
  const a = Math.min(Math.max(actual, 0), max) / max
  const p = planned === null || planned === undefined ? undefined : Math.min(Math.max(planned, 0), max) / max
  const title =
    p === undefined
      ? `Marjă ${pct(actual)}`
      : `Marjă ${pct(actual)} · plan ${pct(planned ?? 0)} · ${num((actual - (planned ?? 0)) * 100, 1)} pt`
  return (
    <div title={title} className={`relative h-2 rounded-full bg-track ${className}`}>
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]}`}
        style={{ width: `${a * 100}%` }}
      />
      {p !== undefined && (
        <div
          aria-hidden
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-tick"
          style={{ left: `calc(${p * 100}% - 1px)` }}
        />
      )}
    </div>
  )
}

/**
 * Banda „ce-ar fi dacă" — componenta semnătură de sub o reconciliere: ce devine
 * prognoza dacă intră o variație în așteptare. O propoziție, cifra îngroșată.
 */
export function WhatIfStrip({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-chip bg-pos-bg px-4 py-3 text-row leading-relaxed text-ink-2">
      {children}
    </div>
  )
}

/** Textul de grafic: „4,0 zile în urmă" / „2,0 zile în avans" / „Conform planului". */
export function scheduleText(behindDays: number): string {
  if (behindDays >= 0.5) return `${zile(behindDays)} în urmă`
  if (behindDays <= -0.5) return `${zile(behindDays)} în avans`
  return 'Conform planului'
}

// ── Tabele ───────────────────────────────────────────────────────────────
// Fără linii verticale, fără zebră. Separator 1px line-1, celule 12px/20px,
// sumele la dreapta și tabulare, rândurile apăsabile se luminează la hover.

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-4 border-b border-line-1 px-5 py-2.5 text-th font-semibold uppercase tracking-[0.07em] text-ink-3">
      {children}
    </div>
  )
}

export function TableRow({
  children,
  onClick,
  className = '',
  selected = false,
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
  selected?: boolean
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`flex items-center gap-4 border-b border-line-1 px-5 py-3 text-row last:border-b-0 ${
        onClick ? 'cursor-pointer transition-colors duration-[120ms] ease-std' : ''
      } ${selected ? 'bg-accent-soft' : onClick ? 'hover:bg-paper-1' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function TableFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-2 bg-paper-1 px-5 py-3 text-row text-ink-2">
      {children}
    </div>
  )
}

// ── Stările aplicației ───────────────────────────────────────────────────

/** Bloc de schelet, cât timp datele sunt pe drum. Niciodată 0 în loc de date. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`cl-skeleton rounded-chip bg-line-1 ${className}`} />
}

/** Cardul-schelet, cu forma unui card de cifră. */
export function StatCardSkeleton() {
  return (
    <div className="rounded-card border border-line-2 bg-paper-0 p-5 shadow-e1">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-4 w-40" />
    </div>
  )
}

/** Lista goală: fără ilustrații — un titlu, o propoziție, o acțiune. */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="text-card font-semibold text-ink-1">{title}</p>
      {children && <p className="mx-auto mt-1.5 max-w-md text-row text-ink-3">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

/** Eroare de date: bandă în linie, o propoziție simplă și un buton de reîncercare. */
export function ErrorStrip({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-chip bg-neg-bg px-4 py-3">
      <p className="text-row font-medium text-neg-pill">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-btn border border-line-3 bg-paper-0 px-3 py-1.5 text-row font-semibold text-ink-2 hover:bg-paper-1"
        >
          Încearcă din nou
        </button>
      )}
    </div>
  )
}

// ── Fereastră modală ─────────────────────────────────────────────────────

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-card bg-paper-0 p-6 shadow-e2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-card font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-segment text-ink-3 hover:text-ink-1"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
