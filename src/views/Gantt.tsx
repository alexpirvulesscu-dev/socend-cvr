// Ecranul Gantt — DOAR diagrama, pe tot ecranul. Filtrul de proiect e propriu
// (independent de selecția din Explorer), ca planificarea timeline-ului să fie
// o activitate separată de editarea zilnică a proiectelor.
import { useState } from 'react'
import type { EntityPatch, ProjectWithKpis } from '../data/projects'
import { todayIso } from '../data/projects'
import { GanttChart } from '../components/gantt/GanttChart'
import { PageHeader, lunaCurenta } from '../components/Shell'

export function GanttView({
  projects,
  patchEntity,
}: {
  projects: ProjectWithKpis[]
  patchEntity: (p: EntityPatch) => void
}) {
  const [focusProjectId, setFocusProjectId] = useState<string | undefined>(undefined)

  return (
    <div className="mx-auto max-w-[1800px] px-8 py-6">
      <PageHeader
        title="Gantt"
        pill={lunaCurenta(todayIso())}
        subtitle="Trage barele ca să muți sau să întinzi joburile și taskurile."
      />
      <div style={{ height: 'calc(100vh - 190px)', minHeight: 460 }}>
        <GanttChart
          projects={projects}
          focusProjectId={focusProjectId}
          onFocusProject={setFocusProjectId}
          patchEntity={patchEntity}
          today={todayIso()}
        />
      </div>
    </div>
  )
}
