// Ecranul Gantt — DOAR diagrama, pe tot ecranul. Filtrul de proiect e propriu
// (independent de selecția din Explorer), ca planificarea timeline-ului să fie
// o activitate separată de editarea zilnică a proiectelor.
import { useState } from 'react'
import type { EntityPatch, ProjectWithKpis } from '../data/projects'
import { todayIso } from '../data/projects'
import { GanttChart } from '../components/gantt/GanttChart'

export function GanttView({
  projects,
  patchEntity,
}: {
  projects: ProjectWithKpis[]
  patchEntity: (p: EntityPatch) => void
}) {
  const [focusProjectId, setFocusProjectId] = useState<string | undefined>(undefined)

  return (
    <div className="mx-auto max-w-[1800px] px-6 py-5">
      <div className="mb-3">
        <h1 className="text-2xl font-semibold">Gantt</h1>
        <p className="mt-0.5 text-sm text-[#5B6673]">
          Planifică în timp: trage barele ca să muți sau să întinzi joburile și taskurile.
        </p>
      </div>
      <div style={{ height: 'calc(100vh - 180px)', minHeight: 460 }}>
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
