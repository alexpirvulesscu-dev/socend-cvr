// resolveSelection: selecția-cale trebuie să „urce" elegant când o entitate dispare.
import { describe, expect, it } from 'vitest'
import { resolveSelection } from './selection'
import type { ProjectWithKpis } from '../data/projects'

// Pentru selecție contează doar id-urile — construim schelete minimale.
function proj(id: string, jobs: { id: string; tasks: string[] }[]): ProjectWithKpis {
  return {
    id,
    jobs: jobs.map((j) => ({
      id: j.id,
      tasks: j.tasks.map((t) => ({ id: t })),
    })),
  } as unknown as ProjectWithKpis
}

const TREE = [proj('p1', [{ id: 'j1', tasks: ['t1', 't2'] }]), proj('p2', [])]

describe('resolveSelection', () => {
  it('păstrează o cale complet validă', () => {
    expect(resolveSelection(TREE, { projectId: 'p1', jobId: 'j1', taskId: 't2' })).toEqual({
      projectId: 'p1',
      jobId: 'j1',
      taskId: 't2',
    })
  })

  it('task șters → rămâne jobul', () => {
    expect(resolveSelection(TREE, { projectId: 'p1', jobId: 'j1', taskId: 'gone' })).toEqual({
      projectId: 'p1',
      jobId: 'j1',
    })
  })

  it('job șters → rămâne proiectul (și taskul se aruncă)', () => {
    expect(resolveSelection(TREE, { projectId: 'p1', jobId: 'gone', taskId: 't1' })).toEqual({
      projectId: 'p1',
    })
  })

  it('proiect șters → selecție goală', () => {
    expect(resolveSelection(TREE, { projectId: 'gone', jobId: 'j1', taskId: 't1' })).toEqual({})
  })

  it('job valid dar din ALT proiect → se aruncă (nu aparține căii)', () => {
    expect(resolveSelection(TREE, { projectId: 'p2', jobId: 'j1' })).toEqual({ projectId: 'p2' })
  })

  it('selecție goală → rămâne goală', () => {
    expect(resolveSelection(TREE, {})).toEqual({})
  })
})
