export const NOTES_SAVE_DEBOUNCE_MS = 600

export interface NotesSaveState {
  text: string
  status: 'idle' | 'saving' | 'saved' | 'error'
  message: string
}

interface Timers {
  set(run: () => void, delay: number): number
  clear(timer: number): void
}

interface Entry extends NotesSaveState {
  saved: string
  version: number
  timer: number | null
  saves: Map<number, Promise<void>>
}

const browserTimers: Timers = {
  set: (run, delay) => globalThis.setTimeout(run, delay) as unknown as number,
  clear: (timer) => globalThis.clearTimeout(timer),
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class NotesSaveQueue {
  private entries = new Map<string, Entry>()
  private wasDirty = false

  constructor(
    private save: (input: { slideId: string; notes: string }) => Promise<void>,
    private dirtyChanged: (dirty: boolean) => void,
    private timers: Timers = browserTimers,
    private changed: (slideId: string) => void = () => {},
    private failed: (slideId: string, error: unknown) => void = () => {},
  ) {}

  get dirty(): boolean {
    return [...this.entries.values()].some((entry) => entry.text !== entry.saved)
  }

  seed(slideId: string, notes: string) {
    if (!this.entries.has(slideId)) {
      this.entries.set(slideId, { text: notes, saved: notes, version: 0, timer: null, saves: new Map(), status: 'idle', message: '' })
    }
  }

  state(slideId: string): NotesSaveState {
    const entry = this.entry(slideId)
    return { text: entry.text, status: entry.status, message: entry.message }
  }

  edit(slideId: string, text: string) {
    const entry = this.entry(slideId)
    entry.text = text
    entry.version++
    entry.status = 'idle'
    entry.message = ''
    if (entry.timer !== null) this.timers.clear(entry.timer)
    entry.timer = this.timers.set(() => {
      entry.timer = null
      void this.start(slideId, entry.version)
    }, NOTES_SAVE_DEBOUNCE_MS)
    this.notify(slideId)
  }

  async flush(slideId: string): Promise<void> {
    const entry = this.entry(slideId)
    if (entry.timer !== null) {
      this.timers.clear(entry.timer)
      entry.timer = null
    }
    if (entry.text === entry.saved) return
    await this.start(slideId, entry.version)
  }

  retry(slideId: string): Promise<void> {
    return this.start(slideId, this.entry(slideId).version)
  }

  dispose() {
    for (const entry of this.entries.values()) if (entry.timer !== null) this.timers.clear(entry.timer)
  }

  private entry(slideId: string): Entry {
    const entry = this.entries.get(slideId)
    if (!entry) throw new Error(`Notes for slide "${slideId}" were not initialized.`)
    return entry
  }

  private start(slideId: string, version: number): Promise<void> {
    const entry = this.entry(slideId)
    const existing = entry.saves.get(version)
    if (existing) return existing
    const text = entry.text
    entry.status = 'saving'
    entry.message = ''
    this.notify(slideId)
    const saving = this.save({ slideId, notes: text })
      .then(() => {
        if (entry.version !== version) return
        entry.saved = text
        entry.status = 'saved'
      })
      .catch((error: unknown) => {
        if (entry.version !== version) return
        entry.status = 'error'
        entry.message = message(error)
        this.failed(slideId, error)
      })
      .finally(() => {
        entry.saves.delete(version)
        this.notify(slideId)
      })
    entry.saves.set(version, saving)
    return saving
  }

  private notify(slideId: string) {
    const dirty = this.dirty
    if (dirty !== this.wasDirty) {
      this.wasDirty = dirty
      this.dirtyChanged(dirty)
    }
    this.changed(slideId)
  }
}
