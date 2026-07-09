// Ecranul de login: email + parolă prin Supabase Auth.
import { useState } from 'react'
import { signIn } from '../lib/auth'
import { Card } from '../components/ui'

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

  const inputCls =
    'w-full rounded-xl border border-[#E8E8E8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#58A834]'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm space-y-4 p-7">
        <div>
          <img src="/logo-socend.png" alt="Socend Construct" className="h-14 w-auto" />
          <h1 className="sr-only">Socend CVR</h1>
          <p className="mt-3 text-sm text-[#5B6673]">
            <span className="font-semibold text-[#0D1A2D]">CVR</span> · cost vs valoare pe proiecte
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6673]" htmlFor="email">
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
            <label className="mb-1 block text-xs font-medium text-[#5B6673]" htmlFor="password">
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
          {error && <p className="text-sm text-[#D64545]">{error}</p>}
          <button
            disabled={busy || !email || !password}
            className="w-full rounded-xl bg-[#58A834] py-2.5 text-sm font-semibold text-white hover:bg-[#46862A] disabled:opacity-40"
          >
            {busy ? 'Se conectează…' : 'Intră în cont'}
          </button>
        </form>
      </Card>
    </div>
  )
}
