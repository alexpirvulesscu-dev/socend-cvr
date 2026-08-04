// Selecția-cale a Explorer-ului: proiect → job → task, ca în coloanele Finder.
// Pure + testabil: nu atinge React și nu atinge Supabase.
import type { ProjectWithKpis } from '../data/projects'

export interface Selection {
  projectId?: string
  jobId?: string
  taskId?: string
}

/**
 * Validează o selecție față de arborele curent și o „repară" urcând la cel mai
 * apropiat strămoș care mai există. Exemple:
 *  - taskul selectat a fost șters → rămâne selectat jobul lui
 *  - jobul a dispărut → rămâne proiectul; proiectul a dispărut → selecție goală
 *  - jobId care nu aparține proiectului selectat → se aruncă (și taskId cu el)
 */
export function resolveSelection(projects: ProjectWithKpis[], sel: Selection): Selection {
  if (!sel.projectId) return {}
  const project = projects.find((p) => p.id === sel.projectId)
  if (!project) return {}

  if (!sel.jobId) return { projectId: project.id }
  const job = project.jobs.find((j) => j.id === sel.jobId)
  if (!job) return { projectId: project.id }

  if (!sel.taskId) return { projectId: project.id, jobId: job.id }
  const task = job.tasks.find((t) => t.id === sel.taskId)
  if (!task) return { projectId: project.id, jobId: job.id }

  return { projectId: project.id, jobId: job.id, taskId: task.id }
}
