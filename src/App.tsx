import { useState } from 'react'
import { useProjectTree } from './data/projects'
import { useVariations } from './data/variations'
import { useAuth, signOut } from './lib/auth'
import { resolveSelection, type Selection } from './lib/selection'
import { Sidebar, type Nav } from './components/Shell'
import { DashboardView } from './views/Dashboard'
import { ExplorerView } from './views/Explorer'
import { GanttView } from './views/Gantt'
import { LookaheadView } from './views/Lookahead'
import { VariatiiView } from './views/Variatii'
import { SantierView } from './views/Santier'
import { ConfigurareView } from './views/Configurare'
import { LoginView } from './views/Login'
import { CronologicView } from './views/Cronologic'
import { Toasts } from './components/Toast'

// v4: biroul are bară laterală (Panou · Proiecte · Gantt · Ce urmează · Variații
// · Șantier) + două ecrane fără intrare proprie în meniu (wizardul de proiect nou
// și vederea cronologică a unui job). Navigarea rămâne prin stare, fără router.
type Screen = Nav | 'config' | 'cronologic'

/** Aplicația de birou (admin, finance). */
function OfficeApp({ email }: { email: string }) {
  const [screen, setScreen] = useState<Screen>('panou')
  const [sel, setSel] = useState<Selection>({})
  const [newVariation, setNewVariation] = useState(false)
  const { projects, loading, error, refetch, patchEntity } = useProjectTree()
  const { variations, patchVariation, addLocal } = useVariations()

  // ecranele fără intrare în meniu se raportează la secțiunea din care vin
  const navActive: Nav =
    screen === 'config' ? 'proiecte' : screen === 'cronologic' ? 'proiecte' : screen

  const shell = (content: React.ReactNode) => (
    <>
      <Sidebar active={navActive} onNav={(n) => setScreen(n)} email={email} />
      <main className="pl-[212px]">{content}</main>
    </>
  )

  // Ecranul global de încărcare apare DOAR la prima citire; refetch-urile de
  // fundal (ex. după închiderea zilei) nu demontează ecranul curent.
  if (loading && projects.length === 0) {
    return shell(<p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>)
  }
  if (error) {
    return shell(<p className="p-8 text-center text-sm text-[#D64545]">Eroare: {error}</p>)
  }

  // selecția „reparată": dacă o entitate a dispărut, urcăm la strămoșul viu
  const resolved = resolveSelection(projects, sel)
  const project = resolved.projectId
    ? projects.find((p) => p.id === resolved.projectId)
    : undefined
  const job =
    project && resolved.jobId ? project.jobs.find((j) => j.id === resolved.jobId) : undefined
  // cronologicul are nevoie de job; dacă a dispărut între timp, cădem pe proiecte
  const effScreen: Screen = screen === 'cronologic' && (!project || !job) ? 'proiecte' : screen

  function openInExplorer(s: Selection) {
    setSel(s)
    setScreen('proiecte')
  }

  return shell(
    <>
      {effScreen === 'panou' && (
        <DashboardView
          projects={projects}
          variations={variations}
          onOpenProject={openInExplorer}
          onNav={(n) => setScreen(n)}
          onNewVariation={() => {
            setNewVariation(true)
            setScreen('variatii')
          }}
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
      {effScreen === 'urmeaza' && (
        <LookaheadView projects={projects} onOpen={openInExplorer} />
      )}
      {effScreen === 'config' && (
        <ConfigurareView
          onDone={() => {
            refetch()
            setScreen('proiecte')
          }}
          onCancel={() => setScreen('proiecte')}
        />
      )}
      {effScreen === 'proiecte' && (
        <ExplorerView
          projects={projects}
          sel={resolved}
          onSelect={setSel}
          patchEntity={patchEntity}
          onRefetch={refetch}
          onNewProject={() => setScreen('config')}
          onOpenCronologic={(projectId, jobId) => {
            setSel({ projectId, jobId })
            setScreen('cronologic')
          }}
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
      <header className="sticky top-0 z-10 border-b border-[#E8E8E8]/60 bg-[rgba(250,249,246,0.8)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-2.5">
          <img src="/logo-socend.png" alt="Socend Construct" className="h-9 w-auto" />
          <button
            onClick={() => void signOut()}
            title={email}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-[#5B6673] hover:text-[#0D1A2D]"
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
    return <p className="p-8 text-center text-sm text-[#5B6673]">Se încarcă…</p>
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
