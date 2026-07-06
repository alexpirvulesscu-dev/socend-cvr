import { useEffect, useState } from 'react'
import { useProjectTree } from './data/projects'
import { ensureDevSession } from './lib/devAuth'
import { ProiecteView } from './views/Proiecte'
import { ProiectView } from './views/Proiect'
import { JobView } from './views/Job'

// Navigare prin stare (fără router), ca în celelalte aplicații Socend.
type Route =
  | { view: 'proiecte' }
  | { view: 'proiect'; projectId: string }
  | { view: 'job'; projectId: string; jobId: string }

function TopBar() {
  return (
    <header className="sticky top-0 z-10 border-b border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.8)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <span className="font-semibold tracking-tight">Socend CVR</span>
        <span className="text-xs text-[#5B6673]">birou</span>
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

  if (!ready || loading) {
    return (
      <>
        <TopBar />
        <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
      </>
    )
  }
  if (error) {
    return (
      <>
        <TopBar />
        <p className="p-8 text-center text-sm text-[#D64545]">Eroare: {error}</p>
      </>
    )
  }

  const project =
    route.view !== 'proiecte' ? projects.find((p) => p.id === route.projectId) : undefined
  const job =
    route.view === 'job' && project ? project.jobs.find((j) => j.id === route.jobId) : undefined

  return (
    <>
      <TopBar />
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
