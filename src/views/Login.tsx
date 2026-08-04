// Ecranul de login: email + parolă prin Supabase Auth.
// Clean Ledger: un singur card centrat, numele aplicației cu serif, câmpuri
// pe border-line-2 și butonul principal din sistem. Eroarea de autentificare
// apare ca bandă în linie (ErrorStrip), niciodată ca text roșu răzleț.
import { useState } from 'react'
import { signIn } from '../lib/auth'
import { Card, ErrorStrip, PrimaryButton } from '../components/ui'

// câmpurile: contur line-2 în repaus, line-3 la hover, accent la focus.
// fără `outline-none` — inelul global de :focus-visible trebuie să rămână vizibil.
const inputCls =
  'w-full rounded-btn border border-line-2 bg-paper-0 px-3 py-2.5 text-row text-ink-1 transition-colors duration-[120ms] ease-std placeholder:text-ink-4 hover:border-line-3 focus:border-accent'
const labelCls = 'mb-1 block text-sub font-medium text-ink-3'

export function LoginView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err = await signIn(email.trim(), password)
    if (err) {
      // mesaj prietenos în română, nu textul tehnic al API-ului
      setError('Email sau parolă greșite. Încearcă din nou.')
      setBusy(false)
    }
    // la succes, onAuthStateChange re-randează aplicația
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <img src="/logo-socend.png" alt="Socend Construct" className="h-14 w-auto" />
        <h1 className="mt-4 text-[clamp(24px,2.2vw,31px)] leading-none text-ink-1">Socend CVR</h1>
        <p className="mt-2 text-sub text-ink-3">
          <span className="font-semibold text-ink-1">CVR</span> · cost vs valoare pe proiecte
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <div>
            <label className={labelCls} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="password">
              Parolă
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <ErrorStrip message={error} />}
          <PrimaryButton type="submit" disabled={busy || !email || !password} className="w-full">
            {busy ? 'Se conectează…' : 'Intră în cont'}
          </PrimaryButton>
        </form>
      </Card>
    </div>
  )
}
