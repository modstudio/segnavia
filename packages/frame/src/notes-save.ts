import { OptimisticSaveCore, type SaveStatus } from './optimistic-save.ts'

export const NOTES_SAVE_DEBOUNCE_MS = 600

export interface NotesSaveState {
  text: string
  status: SaveStatus
  message: string
}

interface Timers {
  set(run: () => void, delay: number): number
  clear(timer: number): void
}

const browserTimers: Timers = {
  set: (run, delay) => globalThis.setTimeout(run, delay) as unknown as number,
  clear: (timer) => globalThis.clearTimeout(timer),
}

type Save = (input: { slideId: string; notes: string }) => Promise<void>

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class NotesSaveQueue {
  private core: OptimisticSaveCore<string, Parameters<Save>[0]>
  private timersBySlide = new Map<string, number>()
  private messages = new Map<string, string>()

  constructor(
    save: Save,
    dirtyChanged: (dirty: boolean) => void,
    private timers: Timers = browserTimers,
    changed: (slideId: string) => void = () => {},
    failed: (slideId: string, error: unknown) => void = () => {},
  ) {
    this.core = new OptimisticSaveCore(
      save,
      (slideId, notes) => ({ slideId, notes }),
      (left, right) => left === right,
      dirtyChanged,
      changed,
      (slideId, error) => {
        this.messages.set(slideId, message(error))
        failed(slideId, error)
      },
    )
  }

  get dirty() {
    return this.core.dirty
  }

  setSave(save: Save) {
    return this.flushAll().then((saved) => (saved ? this.core.setSave(save) : false))
  }

  hasLocalWork(slideId: string) {
    return this.core.hasLocalWork(slideId)
  }

  seed(slideId: string, notes: string) {
    const seeded = this.core.seed(slideId, notes)
    if (seeded) this.messages.delete(slideId)
    return seeded
  }

  state(slideId: string): NotesSaveState {
    const state = this.core.state(slideId)
    return { text: state.value, status: state.status, message: this.messages.get(slideId) ?? '' }
  }

  draft(slideId: string) {
    return this.core.draft(slideId)
  }

  edit(slideId: string, text: string) {
    this.core.editDraft(slideId, text)
    this.messages.delete(slideId)
    this.clearTimer(slideId)
    this.timersBySlide.set(
      slideId,
      this.timers.set(() => {
        this.timersBySlide.delete(slideId)
        void this.core.flush(slideId)
      }, NOTES_SAVE_DEBOUNCE_MS),
    )
  }

  async flush(slideId: string): Promise<boolean> {
    this.clearTimer(slideId)
    return this.core.flush(slideId)
  }

  async flushAll(): Promise<boolean> {
    for (const slideId of [...this.timersBySlide.keys()]) this.clearTimer(slideId)
    return this.core.flushAll()
  }

  retry(slideId: string) {
    this.messages.delete(slideId)
    return this.core.flush(slideId)
  }

  dispose() {
    for (const slideId of [...this.timersBySlide.keys()]) this.clearTimer(slideId)
  }

  private clearTimer(slideId: string) {
    const timer = this.timersBySlide.get(slideId)
    if (timer === undefined) return
    this.timers.clear(timer)
    this.timersBySlide.delete(slideId)
  }
}
