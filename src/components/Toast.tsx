// Toast-uri minimale pentru salvările optimiste: eroarea NU blochează ecranul,
// doar anunță jos-dreapta că salvarea a eșuat (starea a fost deja revenită).
// Fără context React: un mic emitter la nivel de modul + <Toasts/> montat o dată în App.
import { useEffect, useState } from 'react'

export interface ToastMsg {
  id: number
  text: string
  kind: 'error' | 'success'
}

let nextId = 1
let listener: ((t: ToastMsg) => void) | null = null

/** Arată un toast (implicit: eroare). Poate fi apelat de oriunde, inclusiv din async. */
export function toast(text: string, kind: ToastMsg['kind'] = 'error'): void {
  listener?.({ id: nextId++, text, kind })
}

const AUTO_DISMISS_MS = 6000

/** Stiva de toast-uri, montată o singură dată în App. */
export function Toasts() {
  const [items, setItems] = useState<ToastMsg[]>([])

  useEffect(() => {
    listener = (t) => {
      setItems((prev) => [...prev, t])
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), AUTO_DISMISS_MS)
    }
    return () => {
      listener = null
    }
  }, [])

  if (items.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          className={`cursor-pointer rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${
            t.kind === 'error' ? 'bg-[#D64545]' : 'bg-[#58A834]'
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
