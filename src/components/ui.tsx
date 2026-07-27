// Componente UI comune — carduri albe cu contur subțire, pastile, bare de
// progres, modale și butoane de ștergere cu confirmare.
// Limbajul vizual (v4): card alb, contur de un fir, colț 16px, umbră aproape
// invizibilă. Conturul face treaba pe care o făcea umbra grea — separă cardul
// de fundal fără să-l ridice de pe pagină.
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
      className={`rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-[0_1px_2px_rgba(13,26,45,0.03)] ${
        onClick
          ? 'cursor-pointer transition-shadow hover:shadow-[0_2px_10px_rgba(13,26,45,0.07)]'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Cartonaș de cifră, în stilul referinței: etichetă mică gri, cifra mare, apoi
 * pastile de context. Folosit de Panou, de banda KPI și de „Ce urmează", ca
 * toate ecranele să prezinte cifrele la fel.
 */
export function StatCard({
  label,
  value,
  valueColor,
  pills = [],
  footnote,
  hero = false,
}: {
  label: string
  value: string
  valueColor?: string
  pills?: { text: string; tone: KpiColor | 'neutral' }[]
  footnote?: string
  /** cifrele de pe Panou, cele mai mari din aplicație */
  hero?: boolean
}) {
  // verdictele scrise (ex. „1 proiect în urmă") sunt mai lungi decât o cifră;
  // le scădem corpul ca să încapă pe un rând și cardurile să rămână egale
  const size = hero ? 'text-[34px]' : value.length > 14 ? 'text-[22px]' : 'text-[30px]'
  return (
    <Card className="flex flex-col !p-5">
      <p className="text-sm text-[#5B6673]">{label}</p>
      <p className={`mt-1.5 ${size} font-semibold leading-tight tracking-tight ${valueColor ?? ''}`}>
        {value}
      </p>
      {pills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pills.map((p) => (
            <span
              key={p.text}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                p.tone === 'neutral' ? 'bg-[#EEECE7] text-[#5B6673]' : PILL_STYLES[p.tone]
              }`}
            >
              {p.text}
            </span>
          ))}
        </div>
      )}
      {footnote && <p className="mt-auto pt-3 text-xs text-[#5B6673]">{footnote}</p>}
    </Card>
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

// Statusul e informație de rutină, nu un verdict — deci neutru. Culoarea din
// aplicație e rezervată verdictelor (banda KPI) și acțiunilor (butoane verzi).
const STATUS_STYLES: Record<TaskStatus, string> = {
  neinceput: 'bg-[#EEECE7] text-[#5B6673]',
  in_lucru: 'bg-[#EEECE7] text-[#0D1A2D]',
  finalizat: 'bg-[#EEECE7] text-[#5B6673]',
}

export function StatusPill({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status === 'in_lucru' && (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#58A834]" />
      )}
      {status === 'finalizat' && <span aria-hidden>✓</span>}
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
      {/* progresul e DATE, nu o acțiune — deci navy, nu verdele de brand */}
      <div
        className="h-2 rounded-full bg-[#14263F] transition-[width] duration-300"
        style={{ width: `${done}%` }}
      />
      {plan !== undefined && (
        <div
          title="Planificat azi"
          className="absolute -top-1 h-4 w-0.5 rounded bg-[#8798AC]"
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
      // în repaus e discret (un buton roșu care nu s-a apăsat încă = alarmă falsă);
      // roșul apare la hover și, plin, doar când e armat
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        armed
          ? 'bg-[#D64545] text-white'
          : 'text-[#5B6673] hover:bg-[#F8DEDE] hover:text-[#B23A3A]'
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
      className="mb-4 flex items-center gap-1 text-sm font-medium text-[#0D1A2D] hover:underline"
    >
      <span aria-hidden>←</span> {label}
    </button>
  )
}
