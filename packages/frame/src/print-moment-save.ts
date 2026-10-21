import { OptimisticSaveCore, type SaveStatus } from './optimistic-save.ts'

export interface PrintMomentSaveState {
  value: number | null
  status: SaveStatus
}

type Save = (input: { slideId: string; printAtMs: number | null }) => Promise<void>

export class PrintMomentSaveQueue {
  private core: OptimisticSaveCore<number | null, Parameters<Save>[0]>

  constructor(
    save: Save,
    dirtyChanged: (dirty: boolean) => void,
    changed: (slideId: string) => void = () => {},
    failed: (slideId: string, error: unknown) => void = () => {},
  ) {
    this.core = new OptimisticSaveCore(save, (slideId, printAtMs) => ({ slideId, printAtMs }), Object.is, dirtyChanged, changed, failed)
  }

  get dirty() {
    return this.core.dirty
  }
  setSave(save: Save) {
    return this.core.setSave(save)
  }
  seed(slideId: string, value: number | null) {
    return this.core.seed(slideId, value)
  }
  state(slideId: string): PrintMomentSaveState {
    return this.core.state(slideId)
  }
  draft(slideId: string) {
    return this.core.draft(slideId)
  }
  editDraft(slideId: string, value: number | null) {
    this.core.editDraft(slideId, value)
  }
  edit(slideId: string, value: number | null) {
    this.editDraft(slideId, value)
    void this.core.flush(slideId)
  }
  flush(slideId: string) {
    return this.core.flush(slideId)
  }
  flushAll() {
    return this.core.flushAll()
  }
}
