// Editare inline „click-to-edit" — piesa centrală a Explorer-ului v3.
// Model (după Linear/Notion): click → input; Enter SAU blur = salvează;
// Escape = renunță; valoare neschimbată = nu se salvează nimic (no-op).
// Salvarea e treaba apelantului (patch optimist + persist + revert la eroare).
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** Valoarea „de editat" (seed-ul input-ului), ca text. */
  value: string
  /** Ce se afișează în modul de citire; implicit chiar `value`. */
  display?: ReactNode
  type?: 'text' | 'number' | 'date'
  /** Se apelează DOAR când valoarea s-a schimbat. Primește textul brut. */
  onSave: (raw: string) => void | Promise<void>
  /** Clase pentru afișare (modul de citire). */
  className?: string
  /** Clase pentru input (modul de editare). */
  inputClassName?: string
  placeholder?: string
  disabled?: boolean
  /** Titlu la hover (ex. „Click pentru a edita"). */
  title?: string
}

export function InlineEdit({
  value,
  display,
  type = 'text',
  onSave,
  className = '',
  inputClassName = '',
  placeholder,
  disabled,
  title,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  // ține minte dacă am ieșit prin Escape, ca blur-ul care urmează să NU salveze
  const cancelled = useRef(false)

  useEffect(() => {
    if (editing) {
      cancelled.current = false
      setDraft(value)
      // focus + select după montare (select doar la text/număr; la date nu are sens)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        if (type !== 'date') inputRef.current?.select()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  function commit() {
    if (cancelled.current) return
    setEditing(false)
    const raw = draft.trim()
    if (raw === value.trim()) return // no-op: nu scrie nimic
    void onSave(raw)
  }

  function cancel() {
    cancelled.current = true
    setEditing(false)
  }

  if (disabled) {
    return <span className={className}>{display ?? value}</span>
  }

  if (!editing) {
    return (
      <span
        role="button"
        tabIndex={0}
        title={title ?? 'Click pentru a edita'}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            setEditing(true)
          }
        }}
        className={`-mx-1 cursor-text rounded-chip px-1 transition-colors duration-[120ms] ease-std hover:bg-segment ${className}`}
      >
        {display ?? (value || <span className="text-ink-4">{placeholder ?? '–'}</span>)}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      // 'number' folosește input text + inputMode decimal, ca să accepte „2.500,5"
      type={type === 'date' ? 'date' : 'text'}
      inputMode={type === 'number' ? 'decimal' : undefined}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          inputRef.current?.blur() // blur → commit (o singură cale de salvare)
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
      className={`-mx-1 rounded-chip border border-accent bg-paper-0 px-1 text-inherit ${inputClassName}`}
    />
  )
}
