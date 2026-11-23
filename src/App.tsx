import { useEffect, useState } from 'react'
import { useProjectTree } from './data/projects'
import { useVariations } from './data/variations'
import { useAuth, signOut } from './lib/auth'
import { resolveSelection, type Selection } from './lib/selection'
import { Sidebar, type Nav } from './components/Shell'
import { ErrorStrip, Skeleton, StatCardSkeleton } from './components/ui'
import { DashboardView } from './views/Dashboard'
import { ProjectsView } from './views/Projects'
import { ClientiView } from './views/Clienti'
import { useTrackerList } from './data/tracker'
import { ProjectPageView } from './views/ProjectPage'
import { GanttView } from './views/Gantt'
import { LookaheadView } from './views/Lookahead'
import { VariatiiView } from './views/Variatii'
import { SantierView } from './views/Santier'
import { ConfigurareView } from './views/Configurare'
import { StyleguideView } from './views/Styleguide'
import { LoginView } from './views/Login'
import { CronologicView } from './views/Cronologic'
import { Toasts } from './components/Toast'

// Biroul are bară laterală (Dashboard · Proiecte · Program · Ce urmează ·
// Variații · Șantier) + trei ecrane fără intrare proprie în meniu: wizardul de
// proiect nou, vederea cronologică a unui job și ghidul de stil (#styleguide).
// Navigarea rămâne prin stare, fără router.
type Screen = Nav | 'config' | 'cronologic'

/** Scheletul de încărcare: aceeași formă ca pagina care urmează, fără cifre false. */
function PageSkeleton() {
  return (
    <div className="mx-auto max-w-[1500px] px-8 py-6">
      <Skeleton className="h-8 w-52" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
      <Skeleton className="mt-4 h-64 w-full" />
    </div>
  )
}

/** Aplicația de birou (admin, finance). */
function OfficeApp({ email }: { email: string }) {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [sel, setSel] = useState<Selection>({})
  const [newVariation, setNewVariation] = useState(false)
  const { projects, loading, error, refetch, patchEntity } = useProjectTree()
  const { variations, patchVariation, addLocal } = useVariations()
  const trackers = useTrackerList()
  // de unde s-a deschis proiectul: „Înapoi" duce la Clienți sau la Proiecte
  const [fromClienti, setFromClienti] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)

  // Ghidul de stil nu are loc în meniu: se deschide cu #styleguide în adresă.
  useEffect(() => {
    function sync() {
      if (window.location.hash === '#styleguide') setScreen('styleguide')
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // ecranele fără intrare în meniu se raportează la secțiunea din care vin
  const navActive: Nav = screen === 'config' || screen === 'cronologic' ? 'proiecte' : screen

  const shell = (content: React.ReactNode) => (
    <>
      <Sidebar
        active={navActive === 'proiecte' && fromClienti ? 'clienti' : navActive}
        onNav={(n) => {
          if (n === 'proiecte') setFromClienti(false)
          if (n === 'clienti') setClientId(null)
          setScreen(n)
        }}
        email={email}
      />
      <main className="pt-14 md:pl-[212px] md:pt-0">{content}</main>
    </>
  )

  // Ecranul global de încărcare apare DOAR la prima citire; refetch-urile de
  // fundal (ex. după închiderea zilei) nu demontează ecranul curent.
  if (loading && projects.length === 0) return shell(<PageSkeleton />)
  if (error) {
    return shell(
      <div className="mx-auto max-w-[1500px] px-8 py-6">
        <ErrorStrip message={`Nu am putut încărca proiectele: ${error}`} onRetry={refetch} />
      </div>
    )
  }

  // selecția „reparată": dacă o entitate a dispărut, urcăm la strămoșul viu
  const resolved = resolveSelection(projects, sel)
  const project = resolved.projectId ? projects.find((p) => p.id === resolved.projectId) : undefined
  const job = project && resolved.jobId ? project.jobs.find((j) => j.id === resolved.jobId) : undefined
  // cronologicul are nevoie de job; dacă a dispărut între timp, cădem pe proiecte
  const effScreen: Screen = screen === 'cronologic' && (!project || !job) ? 'proiecte' : screen

  function openInProject(s: Selection, fromClients = false) {
    setSel(s)
    setFromClienti(fromClients)
    setScreen('proiecte')
  }

  return shell(
    <>
      {effScreen === 'dashboard' && (
        <DashboardView
          projects={projects}
          variations={variations}
          onOpenProject={openInProject}
          onNav={(n) => setScreen(n)}
          onNewVariation={() => {
            setNewVariation(true)
            setScreen('variatii')
          }}
        />
      )}

      {effScreen === 'proiecte' &&
        (project ? (
          <ProjectPageView
            p={project}
            sel={resolved}
            onSelect={setSel}
            onBack={() => {
              setSel({})
              if (fromClienti) setScreen('clienti')
            }}
            backLabel={fromClienti ? 'Clienți' : 'Proiecte'}
            trackers={trackers}
            onRefetch={refetch}
            patchEntity={patchEntity}
            variations={variations}
            patchVariation={patchVariation}
            addLocal={addLocal}
            onOpenCronologic={(projectId, jobId) => {
              setSel({ projectId, jobId })
              setScreen('cronologic')
            }}
          />
        ) : (
          <ProjectsView
            projects={projects}
            variations={variations}
            onOpen={(projectId) => openInProject({ projectId })}
            onNew={() => setScreen('config')}
          />
        ))}

      {effScreen === 'clienti' && (
        <ClientiView
          projects={projects}
          trackerKeys={new Set(trackers.map((t) => (t.job_id ? `${t.project_id}/${t.job_id}` : t.project_id)))}
          onOpen={(s) => openInProject(s, true)}
          openId={clientId}
          setOpenId={setClientId}
        />
      )}

      {effScreen === 'variatii' && (
        <VariatiiView
          projects={projects}
          variations={variations}
          patchVariation={patchVariation}
          addLocal={addLocal}
          openNewOnMount={newVariation}
        />
      )}
      {effScreen === 'santier' && <SantierView onDataChanged={refetch} />}
      {effScreen === 'gantt' && <GanttView projects={projects} patchEntity={patchEntity} />}
      {effScreen === 'urmeaza' && <LookaheadView projects={projects} onOpen={openInProject} />}
      {effScreen === 'styleguide' && <StyleguideView onBack={() => setScreen('dashboard')} />}
      {effScreen === 'config' && (
        <ConfigurareView
          onDone={() => {
            refetch()
            setScreen('proiecte')
          }}
          onCancel={() => setScreen('proiecte')}
        />
      )}
      {effScreen === 'cronologic' && project && job && (
        <CronologicView job={job} onBack={() => setScreen('proiecte')} />
      )}
    </>
  )
}

/** Aplicația de șantier (rolul site): DOAR ziua de raportare, fără bară laterală. */
function SiteApp({ email }: { email: string }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line-1 bg-paper-0">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2.5">
          <img src="/logo-socend.png" alt="Socend Construct" className="h-9 w-auto" />
          <button
            onClick={() => void signOut()}
            title={email}
            className="rounded-btn px-3 py-2 text-row font-semibold text-ink-3 hover:text-ink-1"
          >
            Ieși
          </button>
        </div>
      </header>
      <SantierView />
    </>
  )
}

function App() {
  const { session, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    )
  }
  if (!session) {
    return <LoginView />
  }

  const email = session.user.email ?? ''
  if (role === 'site') {
    return (
      <>
        <SiteApp email={email} />
        <Toasts />
      </>
    )
  }
  if (role === 'admin' || role === 'finance') {
    return (
      <>
        <OfficeApp email={email} />
        <Toasts />
      </>
    )
  }
  // utilizator autentificat dar fără rol CVR atribuit
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-card font-semibold">Contul tău nu are încă un rol în CVR.</p>
      <p className="text-row text-ink-3">Cere administratorului să îți atribuie unul.</p>
      <button
        onClick={() => void signOut()}
        className="rounded-btn border border-line-3 bg-paper-0 px-5 py-2.5 text-row font-semibold text-ink-2 hover:bg-paper-1"
      >
        Ieși din cont
      </button>
    </div>
  )
}

export default App
