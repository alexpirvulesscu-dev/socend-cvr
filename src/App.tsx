import { useState } from 'react'
import { useProjectTree } from './data/projects'
import { useAuth, signOut, type Role } from './lib/auth'
import { ProiecteView } from './views/Proiecte'
import { ProiectView } from './views/Proiect'
import { JobView } from './views/Job'
import { SantierView } from './views/Santier'
import { ConfigurareView } from './views/Configurare'
import { LoginView } from './views/Login'
import { CronologicView } from './views/Cronologic'

// Navigare prin stare (fără router), ca în celelalte aplicații Socend.
type Route =
  | { view: 'proiecte' }
  | { view: 'proiect'; projectId: string }
  | { view: 'job'; projectId: string; jobId: string }
  | { view: 'cronologic'; projectId: string; jobId: string }
  | { view: 'santier' }
  | { view: 'config' }

function TopBar({
  section,
  onSection,
  role,
  email,
}: {
  section: 'birou' | 'santier'
  onSection: (s: 'birou' | 'santier') => void
  role: Role
  email: string
}) {
  const tab = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
      active ? 'bg-[#DDEDDC] text-[#0D1A2D]' : 'text-[#5B6673] hover:text-[#0D1A2D]'
    }`
  return (
    <header className="sticky top-0 z-10 border-b border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.8)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5">
        <span className="flex items-center gap-2.5">
          <img src="/logo-socend.png" alt="Socend Construct" className="h-10 w-auto" />
          <span className="rounded-md bg-[#DDEDDC] px-2 py-1 text-sm font-bold tracking-wide text-[#46862A]">
            CVR
          </span>
        </span>
        <div className="flex items-center gap-2">
          {/* rolul site vede DOAR Șantier — fără taburi de birou */}
          {role !== 'site' && (
            <nav className="flex gap-1">
              <button className={tab(section === 'birou')} onClick={() => onSection('birou')}>
                Proiecte
              </button>
              <button className={tab(section === 'santier')} onClick={() => onSection('santier')}>
                Șantier
              </button>
            </nav>
          )}
          <button
            onClick={() => void signOut()}
            title={email}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-[#5B6673] hover:text-[#0D1A2D]"
          >
            Ieși
          </button>
        </div>
      </div>
    </header>
  )
}

/** Aplicația de birou (admin, finance): proiecte + șantier + configurare. */
function OfficeApp({ role, email }: { role: Role; email: string }) {
  const [route, setRoute] = useState<Route>({ view: 'proiecte' })
  const { projects, loading, error, refetch } = useProjectTree()

  const section = route.view === 'santier' ? 'santier' : 'birou'
  const onSection = (s: 'birou' | 'santier') =>
    setRoute(s === 'santier' ? { view: 'santier' } : { view: 'proiecte' })

  // Ecranul global de încărcare apare DOAR la prima citire; refetch-urile de
  // fundal (ex. după închiderea zilei) nu demontează ecranul curent.
  if (loading && projects.length === 0) {
    return (
      <>
        <TopBar section={section} onSection={onSection} role={role} email={email} />
        <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
      </>
    )
  }
  if (error) {
    return (
      <>
        <TopBar section={section} onSection={onSection} role={role} email={email} />
        <p className="p-8 text-center text-sm text-[#D64545]">Eroare: {error}</p>
      </>
    )
  }

  const project =
    route.view === 'proiect' || route.view === 'job' || route.view === 'cronologic'
      ? projects.find((p) => p.id === route.projectId)
      : undefined
  const job =
    (route.view === 'job' || route.view === 'cronologic') && project
      ? project.jobs.find((j) => j.id === route.jobId)
      : undefined

  return (
    <>
      <TopBar section={section} onSection={onSection} role={role} email={email} />
      {route.view === 'santier' && <SantierView onDataChanged={refetch} />}
      {route.view === 'config' && (
        <ConfigurareView
          onDone={() => {
            refetch()
            setRoute({ view: 'proiecte' })
          }}
          onCancel={() => setRoute({ view: 'proiecte' })}
        />
      )}
      {route.view === 'proiecte' && (
        <ProiecteView
          projects={projects}
          onOpen={(projectId) => setRoute({ view: 'proiect', projectId })}
          onNew={() => setRoute({ view: 'config' })}
          onChanged={refetch}
        />
      )}
      {route.view === 'proiect' && project && (
        <ProiectView
          project={project}
          onBack={() => setRoute({ view: 'proiecte' })}
          onOpenJob={(jobId) => setRoute({ view: 'job', projectId: project.id, jobId })}
          onChanged={refetch}
          onDeleted={() => {
            refetch()
            setRoute({ view: 'proiecte' })
          }}
        />
      )}
      {route.view === 'job' && project && job && (
        <JobView
          job={job}
          projectId={project.id}
          projectName={project.name}
          jobsCount={project.jobs.length}
          onBack={() => setRoute({ view: 'proiect', projectId: project.id })}
          onChanged={refetch}
          onCronologic={() =>
            setRoute({ view: 'cronologic', projectId: project.id, jobId: job.id })
          }
          onJobDeleted={() => {
            refetch()
            setRoute({ view: 'proiect', projectId: project.id })
          }}
        />
      )}
      {route.view === 'cronologic' && project && job && (
        <CronologicView
          job={job}
          onBack={() => setRoute({ view: 'job', projectId: project.id, jobId: job.id })}
        />
      )}
    </>
  )
}

/** Aplicația de șantier (rolul site): DOAR ziua de raportare. */
function SiteApp({ role, email }: { role: Role; email: string }) {
  return (
    <>
      <TopBar section="santier" onSection={() => {}} role={role} email={email} />
      <SantierView />
    </>
  )
}

function App() {
  const { session, role, loading } = useAuth()

  if (loading) {
    return <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
  }
  if (!session) {
    return <LoginView />
  }

  const email = session.user.email ?? ''
  if (role === 'site') {
    return <SiteApp role={role} email={email} />
  }
  if (role === 'admin' || role === 'finance') {
    return <OfficeApp role={role} email={email} />
  }
  // utilizator autentificat dar fără rol CVR atribuit
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="font-medium">Contul tău nu are încă un rol în CVR.</p>
      <p className="text-sm text-[#5B6673]">Cere administratorului să îți atribuie unul.</p>
      <button
        onClick={() => void signOut()}
        className="rounded-full bg-[#EEECE7] px-5 py-2.5 text-sm font-medium"
      >
        Ieși din cont
      </button>
    </div>
  )
}

export default App
