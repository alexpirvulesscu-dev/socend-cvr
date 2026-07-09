// Componente UI comune — carduri albe fără border, pastile, bare de progres,
// modale și butoane de ștergere cu confirmare. Stil: Apple-like, conform tokens.
import { useEffect, useState, type ReactNode } from 'react'
import type { KpiColor, TaskStatus } from '../domain/kpi'
import { STATUS_LABELS } from '../data/projects'
import { zile } from '../lib/format'

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-[20px] bg-white p-5 shadow-[0_1px_2px_rgba(13,26,45,0.04),0_8px_24px_rgba(13,26,45,0.06)] ${
        onClick ? 'cursor-pointer transition-shadow hover:shadow-[0_2px_4px_rgba(13,26,45,0.06),0_12px_32px_rgba(13,26,45,0.10)]' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

// Culorile pastilelor KPI: fundal tentă + text închis din aceeași familie
const PILL_STYLES: Record<KpiColor, string> = {
  good: 'bg-[#DDEDDC] text-[#46862A]',
  warning: 'bg-[#FBF0D3] text-[#A87400]',
  error: 'bg-[#F8DEDE] text-[#B23A3A]',
}

export function KpiPill({ color, children }: { color: KpiColor; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${PILL_STYLES[color]}`}
    >
      {children}
    </span>
  )
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  neinceput: 'bg-[#EEECE7] text-[#5B6673]',
  in_lucru: 'bg-[#DDEDDC] text-[#46862A]',
  finalizat: 'bg-[#58A834] text-white',
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Bară de progres cu reper de plan: fill = realizat, liniuța = unde ar trebui să fim azi. */
export function ProgressBar({
  donePct,
  planPct,
  className = '',
}: {
  donePct: number
  planPct?: number
  className?: string
}) {
  const done = Math.min(Math.max(donePct, 0), 1) * 100
  const plan = planPct === undefined ? undefined : Math.min(Math.max(planPct, 0), 1) * 100
  return (
    <div className={`relative h-2 overflow-visible rounded-full bg-[#EEECE7] ${className}`}>
      <div
        className="h-2 rounded-full bg-[#58A834] transition-[width] duration-300"
        style={{ width: `${done}%` }}
      />
      {plan !== undefined && (
        <div
          title="Planificat azi"
          className="absolute -top-1 h-4 w-0.5 rounded bg-[#0D1A2D]"
          style={{ left: `calc(${plan}% - 1px)` }}
        />
      )}
    </div>
  )
}

/** Textul pastilei de grafic, ca în design: „4 zile în urmă" / „2 zile în avans" / „Conform planului". */
export function scheduleText(behindDays: number): string {
  if (behindDays >= 0.5) return `${zile(behindDays)} în urmă`
  if (behindDays <= -0.5) return `${zile(behindDays)} în avans`
  return 'Conform planului'
}

/** Pastilă neutră (gri), ca „Marjă 23,6%" sau „2 taskuri în lucru" din design. */
export function NeutralPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-[#EEECE7] px-2.5 py-1 text-xs font-medium text-[#5B6673]">
      {children}
    </span>
  )
}

/** Fereastră modală simplă, în stilul cardurilor: overlay + card centrat. */
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0D1A2D]/30 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-[20px] bg-white p-6 shadow-[0_2px_4px_rgba(13,26,45,0.06),0_12px_32px_rgba(13,26,45,0.10)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EEECE7] text-[#5B6673] hover:text-[#0D1A2D]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Buton de ștergere cu confirmare prin dublă apăsare: prima apăsare îl
 * transformă în „Sigur? Apasă din nou", a doua execută. Fără dialoguri de browser.
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
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        armed ? 'bg-[#D64545] text-white' : 'bg-[#F8DEDE] text-[#B23A3A] hover:bg-[#F3CACA]'
      } ${className}`}
    >
      {armed ? armedLabel : label}
    </button>
  )
}

/** Săgeată de întoarcere pentru ecranele de detaliu. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 flex items-center gap-1 text-sm font-medium text-[#115468] hover:underline"
    >
      <span aria-hidden>←</span> {label}
    </button>
  )
}
