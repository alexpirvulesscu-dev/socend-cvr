// Salvarea optimistă, folosită de toate câmpurile editabile inline:
// patch local imediat → persistă în fundal → la eroare revine și anunță.
import type { EntityPatch } from './projects'
import { toast } from '../components/Toast'

export type Save = (apply: EntityPatch, revert: EntityPatch, persist: () => Promise<void>) => void

export function makeSave(patchEntity: (p: EntityPatch) => void): Save {
  return (apply, revert, persist) => {
    patchEntity(apply)
    persist().catch((e: Error) => {
      patchEntity(revert)
      toast(`Nu s-a salvat: ${e.message}`)
    })
  }
}
