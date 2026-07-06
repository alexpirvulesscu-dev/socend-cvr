import { useEffect, useState } from 'react'
import { useProjectTree } from './data/projects'
import { ensureDevSession } from './lib/devAuth'
import { lei, pct } from './lib/format'

// Listă minimă de proiecte (faza 2.3) — faza 3 o aduce 1:1 la design.
function ProjectList() {
  const { projects, loading, error } = useProjectTree()

  if (loading) return <p className="p-8 text-[#5B6673]">Se încarcă proiectele…</p>
  if (error) return <p className="p-8 text-[#D64545]">Eroare: {error}</p>

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Proiecte</h1>
      {projects.map((p) => (
        <div key={p.id} className="rounded-[20px] bg-white p-6 shadow-[0_1px_2px_rgba(13,26,45,0.04),0_8px_24px_rgba(13,26,45,0.06)]">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <span className="text-sm text-[#5B6673]">{p.client}</span>
          </div>
          <p className="mt-1 text-sm text-[#5B6673]">Contract: {lei(p.contract_value)}</p>
          <p className="mt-2 text-sm">
            Lucrări executate: <strong>{lei(Math.round(p.kpis.ev))}</strong> ·{' '}
            {pct(p.kpis.donePct)} din contract · marjă {pct(p.kpis.margin)}
          </p>
        </div>
      ))}
    </div>
  )
}

function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    ensureDevSession().finally(() => setReady(true))
  }, [])

  if (!ready) return null
  return <ProjectList />
}

export default App
