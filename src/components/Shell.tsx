// Carcasa aplicației de birou: bară laterală + antet de pagină.
// Sub 900px bara laterală devine o bandă de sus cu un sertar (drawer).
// Navigarea rămâne prin stare, fără router.
import { useEffect, useState, type ReactNode } from 'react'
import { signOut } from '../lib/auth'

export type Nav =
  | 'dashboard'
  | 'clienti'
  | 'proiecte'
  | 'gantt'
  | 'urmeaza'
  | 'variatii'
  | 'santier'
  | 'styleguide'

const NAV_ITEMS: { key: Nav; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'clienti', label: 'Clienți' },
  { key: 'proiecte', label: 'Proiecte' },
  { key: 'gantt', label: 'Program' },
  { key: 'urmeaza', label: 'Ce urmează' },
  { key: 'variatii', label: 'Variații' },
  { key: 'santier', label: 'Șantier' },
]

/** Serif — DOAR pentru titluri de pagină și pentru wordmark. */
export const SERIF = 'var(--font-serif)'

function NavList({ active, onNav }: { active: Nav; onNav: (n: Nav) => void }) {
  return (
    <nav className="flex-1 space-y-0.5 px-3">
      {NAV_ITEMS.map((i) => {
        const on = active === i.key
        return (
          <button
            key={i.key}
            onClick={() => onNav(i.key)}
            className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-nav transition-colors duration-[120ms] ease-std ${
              on
                ? 'bg-accent-soft font-semibold text-accent-ink'
                : 'font-medium text-ink-2 hover:bg-paper-1'
            }`}
          >
            <span
              aria-hidden
              className={`h-[7px] w-[7px] shrink-0 rounded-[2px] ${on ? 'bg-accent' : 'bg-ink-4'}`}
            />
            {i.label}
          </button>
        )
      })}
    </nav>
  )
}

function UserChip({ email }: { email: string }) {
  return (
    <div className="border-t border-line-1 px-4 py-4">
      <button
        onClick={() => void signOut()}
        title="Ieși din cont"
        className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left transition-colors duration-[120ms] ease-std hover:bg-paper-1"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-pill font-bold text-accent-ink">
          {email.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-row font-semibold text-ink-1">
            {email.split('@')[0]}
          </span>
          <span className="block text-sub font-medium text-ink-3">Ieși din cont</span>
        </span>
      </button>
    </div>
  )
}

export function Sidebar({
  active,
  onNav,
  email,
}: {
  active: Nav
  onNav: (n: Nav) => void
  email: string
}) {
  const [open, setOpen] = useState(false)
  // sertarul se închide singur când schimbi ecranul
  useEffect(() => setOpen(false), [active])

  return (
    <>
      {/* bara laterală, de la 900px în sus */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-[212px] flex-col border-r border-line-1 bg-paper-0 md:flex">
        <div className="px-6 pb-6 pt-6">
          <img src="/logo-socend.png" alt="Socend Construct" className="h-9 w-auto" />
        </div>
        <NavList active={active} onNav={onNav} />
        <UserChip email={email} />
      </aside>

      {/* banda de sus, sub 900px */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-line-1 bg-paper-0 px-4 md:hidden">
        <img src="/logo-socend.png" alt="Socend Construct" className="h-7 w-auto" />
        <button
          onClick={() => setOpen(true)}
          aria-label="Meniu"
          className="flex h-10 w-10 items-center justify-center rounded-btn border border-line-3 text-ink-2 transition-colors duration-[120ms] ease-std hover:bg-paper-1"
        >
          ☰
        </button>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-scrim md:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-full w-[280px] flex-col bg-paper-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pb-6 pt-6">
              <img src="/logo-socend.png" alt="Socend Construct" className="h-9 w-auto" />
            </div>
            <NavList active={active} onNav={onNav} />
            <UserChip email={email} />
          </div>
        </div>
      )}
    </>
  )
}

/** Antetul unei pagini: titlu serif + pastilă de context + acțiunea principală. */
export function PageHeader({
  title,
  pill,
  action,
  subtitle,
  back,
  className = '',
}: {
  title: string
  pill?: ReactNode
  action?: ReactNode
  subtitle?: ReactNode
  /** butonul de întoarcere, în stânga titlului */
  back?: ReactNode
  className?: string
}) {
  return (
    <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {back}
        <h1
          className="text-[clamp(24px,2.2vw,31px)] leading-none text-ink-1"
          style={{ fontFamily: SERIF }}
        >
          {title}
        </h1>
        {/* un text primește rama de pastilă; o pastilă gata făcută se pune ca atare */}
        {typeof pill === 'string' ? (
          <span className="rounded-full border border-line-2 bg-paper-0 px-3 py-1.5 text-row font-semibold text-ink-2">
            {pill}
          </span>
        ) : (
          pill
        )}
        {subtitle && <span className="text-row text-ink-3">{subtitle}</span>}
      </div>
      {action}
    </div>
  )
}

/** Luna curentă, ca „Iulie 2026" — pastila de context din antet. */
export function lunaCurenta(today: string): string {
  const s = new Date(today + 'T00:00:00').toLocaleDateString('ro-RO', {
    month: 'long',
    year: 'numeric',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}
