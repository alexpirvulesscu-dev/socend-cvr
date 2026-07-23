import { useState } from 'react'
import { useProjectTree } from './data/projects'
import { useAuth, signOut, type Role } from './lib/auth'
import { resolveSelection, type Selection } from './lib/selection'
import { ExplorerView } from './views/Explorer'
import { SantierView } from './views/Santier'
import { ConfigurareView } from './views/Configurare'
import { LoginView } from './views/Login'
import { CronologicView } from './views/Cronologic'
import { Toasts } from './components/Toast'

// v3: biroul are UN singur ecran (Explorer, coloane Miller) + Cronologic +
// wizard-ul de proiect nou. Navigarea rămâne prin stare, fără router.
type Screen = 'explorer' | 'santier' | 'config' | 'cronologic'

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
      <div className="mx-auto flex max-w-[1800px] items-center justify-between px-6 py-2.5">
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

/** Aplicația de birou (admin, finance): Explorer + șantier + configurare. */
function OfficeApp({ role, email }: { role: Role; email: string }) {
  const [screen, setScreen] = useState<Screen>('explorer')
  const [sel, setSel] = useState<Selection>({})
  const { projects, loading, error, refetch, patchEntity } = useProjectTree()

  const section = screen === 'santier' ? 'santier' : 'birou'
  const onSection = (s: 'birou' | 'santier') =>
    setScreen(s === 'santier' ? 'santier' : 'explorer')

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

  // selecția „reparată": dacă o entitate a dispărut, urcăm la strămoșul viu
  const resolved = resolveSelection(projects, sel)
  const project = resolved.projectId
    ? projects.find((p) => p.id === resolved.projectId)
    : undefined
  const job =
    project && resolved.jobId ? project.jobs.find((j) => j.id === resolved.jobId) : undefined
  // cronologicul are nevoie de job; dacă a dispărut între timp, cădem pe explorer
  const effScreen: Screen = screen === 'cronologic' && (!project || !job) ? 'explorer' : screen

  return (
    <>
      <TopBar section={section} onSection={onSection} role={role} email={email} />
      {effScreen === 'santier' && <SantierView onDataChanged={refetch} />}
      {effScreen === 'config' && (
        <ConfigurareView
          onDone={() => {
            refetch()
            setScreen('explorer')
          }}
          onCancel={() => setScreen('explorer')}
        />
      )}
      {effScreen === 'explorer' && (
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
        <CronologicView job={job} onBack={() => setScreen('explorer')} />
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
    return (
      <>
        <SiteApp role={role} email={email} />
        <Toasts />
      </>
    )
  }
  if (role === 'admin' || role === 'finance') {
    return (
      <>
        <OfficeApp role={role} email={email} />
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
