// Carcasa aplicației de birou (v4): bară laterală în stânga + antet de pagină,
// după referința de design. Navigarea rămâne prin stare, fără router.
import type { ReactNode } from 'react'
import { signOut } from '../lib/auth'

export type Nav = 'panou' | 'proiecte' | 'gantt' | 'urmeaza' | 'variatii' | 'santier'

const NAV_ITEMS: { key: Nav; label: string }[] = [
  { key: 'panou', label: 'Panou' },
  { key: 'proiecte', label: 'Proiecte' },
  { key: 'gantt', label: 'Gantt' },
  { key: 'urmeaza', label: 'Ce urmează' },
  { key: 'variatii', label: 'Variații' },
  { key: 'santier', label: 'Șantier' },
]

/** Titlu de pagină cu serif — singurul loc unde ne abatem de la Inter/SF Pro. */
export const SERIF = "ui-serif, Georgia, 'Times New Roman', serif"

export function Sidebar({
  active,
  onNav,
  email,
}: {
  active: Nav
  onNav: (n: Nav) => void
  email: string
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-[212px] flex-col border-r border-[#E8E8E8] bg-white">
      <div className="px-6 pb-6 pt-6">
        <img src="/logo-socend.png" alt="Socend Construct" className="h-9 w-auto" />
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV_ITEMS.map((i) => {
          const on = active === i.key
          return (
            <button
              key={i.key}
              onClick={() => onNav(i.key)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                on
                  ? 'bg-[#DDEDDC] font-semibold text-[#0D1A2D]'
                  : 'font-medium text-[#5B6673] hover:bg-[#F1EEE9] hover:text-[#0D1A2D]'
              }`}
            >
              <span
                aria-hidden
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${on ? 'bg-[#58A834]' : 'bg-[#C9C5BC]'}`}
              />
              {i.label}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-[#E8E8E8] px-4 py-4">
        <button
          onClick={() => void signOut()}
          title="Ieși din cont"
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-[#F1EEE9]"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DDEDDC] text-xs font-bold text-[#46862A]">
            {email.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{email.split('@')[0]}</span>
            <span className="block text-xs text-[#5B6673]">Ieși din cont</span>
          </span>
        </button>
      </div>
    </aside>
  )
}

/** Antetul unei pagini: titlu serif + pastilă de context + acțiunea principală. */
export function PageHeader({
  title,
  pill,
  action,
  subtitle,
}: {
  title: string
  pill?: string
  action?: ReactNode
  subtitle?: string
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl leading-none tracking-tight" style={{ fontFamily: SERIF }}>
          {title}
        </h1>
        {pill && (
          <span className="rounded-full border border-[#E8E8E8] bg-white px-3.5 py-1.5 text-sm font-medium text-[#0D1A2D]">
            {pill}
          </span>
        )}
        {subtitle && <span className="text-sm text-[#5B6673]">{subtitle}</span>}
      </div>
      {action}
    </div>
  )
}

/** Butonul principal, verde plin — o singură acțiune per pagină. */
export function PrimaryButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl bg-[#2C6E36] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#255C2D]"
    >
      {children}
    </button>
  )
}

/** Luna curentă, ca „iulie 2026" — pastila de context din antet. */
export function lunaCurenta(today: string): string {
  const s = new Date(today + 'T00:00:00').toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
