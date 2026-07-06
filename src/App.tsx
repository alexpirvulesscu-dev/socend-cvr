import { useEffect, useState } from 'react'
import { useProjectTree } from './data/projects'
import { ensureDevSession } from './lib/devAuth'
import { ProiecteView } from './views/Proiecte'
import { ProiectView } from './views/Proiect'
import { JobView } from './views/Job'
import { SantierView } from './views/Santier'

// Navigare prin stare (fără router), ca în celelalte aplicații Socend.
type Route =
  | { view: 'proiecte' }
  | { view: 'proiect'; projectId: string }
  | { view: 'job'; projectId: string; jobId: string }
  | { view: 'santier' }

function TopBar({
  section,
  onSection,
}: {
  section: 'birou' | 'santier'
  onSection: (s: 'birou' | 'santier') => void
}) {
  const tab = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-[#0D1A2D] text-white' : 'text-[#5B6673] hover:text-[#0D1A2D]'
    }`
  return (
    <header className="sticky top-0 z-10 border-b border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.8)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5">
        <span className="font-semibold tracking-tight">Socend CVR</span>
        <nav className="flex gap-1">
          <button className={tab(section === 'birou')} onClick={() => onSection('birou')}>
            Proiecte
          </button>
          <button className={tab(section === 'santier')} onClick={() => onSection('santier')}>
            Șantier
          </button>
        </nav>
      </div>
    </header>
  )
}

function App() {
  const [ready, setReady] = useState(false)
  const [route, setRoute] = useState<Route>({ view: 'proiecte' })
  const { projects, loading, error, refetch } = useProjectTree()

  useEffect(() => {
    ensureDevSession().then(() => {
      setReady(true)
      refetch()
    })
  }, [refetch])

  const section = route.view === 'santier' ? 'santier' : 'birou'
  const onSection = (s: 'birou' | 'santier') =>
    setRoute(s === 'santier' ? { view: 'santier' } : { view: 'proiecte' })

  // Ecranul global de încărcare apare DOAR la prima citire; refetch-urile de
  // fundal (ex. după închiderea zilei) nu demontează ecranul curent.
  if (!ready || (loading && projects.length === 0)) {
    return (
      <>
        <TopBar section={section} onSection={onSection} />
        <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
      </>
    )
  }
  if (error) {
    return (
      <>
        <TopBar section={section} onSection={onSection} />
        <p className="p-8 text-center text-sm text-[#D64545]">Eroare: {error}</p>
      </>
    )
  }

  const project =
    route.view === 'proiect' || route.view === 'job'
      ? projects.find((p) => p.id === route.projectId)
      : undefined
  const job =
    route.view === 'job' && project ? project.jobs.find((j) => j.id === route.jobId) : undefined

  return (
    <>
      <TopBar section={section} onSection={onSection} />
      {route.view === 'santier' && <SantierView onDataChanged={refetch} />}
      {route.view === 'proiecte' && (
        <ProiecteView
          projects={projects}
          onOpen={(projectId) => setRoute({ view: 'proiect', projectId })}
        />
      )}
      {route.view === 'proiect' && project && (
        <ProiectView
          project={project}
          onBack={() => setRoute({ view: 'proiecte' })}
          onOpenJob={(jobId) => setRoute({ view: 'job', projectId: project.id, jobId })}
        />
      )}
      {route.view === 'job' && project && job && (
        <JobView
          job={job}
          projectName={project.name}
          onBack={() => setRoute({ view: 'proiect', projectId: project.id })}
          onChanged={refetch}
        />
      )}
    </>
  )
}

export default App
