// Ecranul „Sugestii", ca în aplicația Socend HR: cine, când, ce propune.
// Sugestia are un titlu scurt (cel mult 80 de caractere) și, separat,
// informații suplimentare, cât e nevoie.
import { useState } from 'react'
import { addSuggestion, useSuggestions, TITLE_MAX, type Suggestion } from '../data/suggestions'
import { Card, EmptyState, ErrorStrip, GhostButton, Modal, PrimaryButton, Skeleton } from '../components/ui'
import { SERIF } from '../components/Shell'
import { toast } from '../components/Toast'

const NAME_KEY = 'cvr-sugestii-nume'

/** „24 noiembrie 2026 la 20:51", pe ora României. */
function cand(iso: string): string {
  const d = new Date(iso)
  const zi = d.toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long', year: 'numeric' })
  const ora = d.toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' })
  return `${zi} la ${ora}`
}

function Bec({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2l.1.7h4.8l.1-.7c.1-.8.5-1.5 1.1-2A6 6 0 0 0 12 3Z" />
    </svg>
  )
}

function SugestieNoua({ onClose, onSaved }: { onClose: () => void; onSaved: (s: Suggestion) => void }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!name.trim()) return toast('Scrie numele tău.')
    if (!title.trim()) return toast('Scrie sugestia.')
    setBusy(true)
    try {
      const s = await addSuggestion({ author_name: name.trim(), title: title.trim(), details: details.trim() || null })
      try {
        localStorage.setItem(NAME_KEY, name.trim())
      } catch {
        // fără memorie locală, numele se scrie din nou data viitoare
      }
      onSaved(s)
      toast('Sugestie trimisă', 'success')
      onClose()
    } catch (e) {
      toast(`Nu s-a salvat: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const label = 'mb-1 flex items-center justify-between text-sub font-medium text-ink-3'
  const input =
    'w-full rounded-btn border border-line-2 bg-paper-0 px-3 text-row text-ink-1 hover:border-line-3 focus:border-accent'
  return (
    <Modal title="Sugestie nouă" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label htmlFor="sg-nume" className={label}>
            Nume
          </label>
          <input id="sg-nume" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nume și prenume" className={`${input} h-10`} />
        </div>
        <div>
          <label htmlFor="sg-titlu" className={label}>
            <span>Sugestie</span>
            <span className="tabular-nums text-ink-4">
              {title.length} / {TITLE_MAX}
            </span>
          </label>
          <input
            id="sg-titlu"
            value={title}
            maxLength={TITLE_MAX}
            autoFocus={!!name}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Pe scurt, ce propui"
            className={`${input} h-10`}
          />
        </div>
        <div>
          <label htmlFor="sg-info" className={label}>
            Informații suplimentare
          </label>
          <textarea
            id="sg-info"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Detalii, exemple, unde apare problema. Poți scrie cât vrei."
            className={`${input} min-h-[140px] py-2.5`}
          />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <PrimaryButton onClick={() => void save()} disabled={busy}>
          Trimite
        </PrimaryButton>
        <GhostButton onClick={onClose}>Renunță</GhostButton>
      </div>
    </Modal>
  )
}

export function SugestiiView() {
  const { list, error, reload, setList } = useSuggestions()
  const [nou, setNou] = useState(false)
  const th = 'px-5 py-3 text-left text-th font-semibold uppercase tracking-[0.07em] text-ink-3'
  const td = 'border-t border-line-1 px-5 py-3.5 align-top text-row'

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-accent-soft text-accent-ink">
            <Bec className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-[clamp(24px,2.2vw,31px)] leading-none text-ink-1" style={{ fontFamily: SERIF }}>
              Sugestii
            </h1>
            <p className="mt-1 text-row text-ink-3">Probleme și idei pentru o aplicație mai bună</p>
          </div>
        </div>
        <PrimaryButton onClick={() => setNou(true)}>+ Sugestie nouă</PrimaryButton>
      </div>

      {error ? (
        <ErrorStrip message={`Nu am putut încărca sugestiile: ${error}`} onRetry={() => void reload()} />
      ) : !list ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState title="Nicio sugestie încă">Apasă „Sugestie nouă” pentru a scrie prima idee.</EmptyState>
        </Card>
      ) : (
        <Card className="!p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={`${th} w-[170px]`}>Nume</th>
                  <th className={`${th} w-[200px]`}>Data</th>
                  <th className={`${th} w-[280px]`}>Sugestie</th>
                  <th className={th}>Informații suplimentare</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id}>
                    <td className={`${td} font-semibold text-ink-1`}>{s.author_name}</td>
                    <td className={`${td} whitespace-nowrap text-ink-3`}>{cand(s.created_at)}</td>
                    <td className={`${td} text-ink-1`}>{s.title}</td>
                    <td className={`${td} whitespace-pre-wrap text-ink-2`}>{s.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {nou && <SugestieNoua onClose={() => setNou(false)} onSaved={(s) => setList([s, ...(list ?? [])])} />}
    </div>
  )
}
