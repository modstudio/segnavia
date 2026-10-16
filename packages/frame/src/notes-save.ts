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
  host: string
  version: number
  timer: number | null
  saves: Map<number, Promise<boolean>>
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

  setSave(save: (input: { slideId: string; notes: string }) => Promise<void>) {
    this.save = save
  }

  hasLocalWork(slideId: string): boolean {
    const entry = this.entry(slideId)
    return entry.text !== entry.saved || entry.saves.size > 0
  }

  seed(slideId: string, notes: string): boolean {
    const existing = this.entries.get(slideId)
    if (!existing) {
      this.entries.set(slideId, {
        text: notes,
        saved: notes,
        host: notes,
        version: 0,
        timer: null,
        saves: new Map(),
        status: 'idle',
        message: '',
      })
      return true
    }
    if (existing.text !== existing.saved || existing.saves.size > 0) return false
    if (existing.host === notes) return false
    if (existing.text === notes) {
      existing.host = notes
      return false
    }
    existing.text = notes
    existing.saved = notes
    existing.host = notes
    existing.status = 'idle'
    existing.message = ''
    this.notify(slideId)
    return true
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

  async flush(slideId: string): Promise<boolean> {
    const entry = this.entry(slideId)
    if (entry.timer !== null) {
      this.timers.clear(entry.timer)
      entry.timer = null
    }
    if (entry.text === entry.saved) return true
    const saved = await this.start(slideId, entry.version)
    return saved && entry.text === entry.saved
  }

  async flushAll(): Promise<boolean> {
    for (const [slideId, entry] of this.entries) {
      if (entry.timer !== null) {
        this.timers.clear(entry.timer)
        entry.timer = null
      }
      if (entry.text !== entry.saved) void this.start(slideId, entry.version)
    }
    const pending = [...this.entries.values()].flatMap((entry) => [...entry.saves.values()])
    const results = await Promise.all(pending)
    return results.every(Boolean) && !this.dirty
  }

  retry(slideId: string): Promise<boolean> {
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

  private start(slideId: string, version: number): Promise<boolean> {
    const entry = this.entry(slideId)
    const existing = entry.saves.get(version)
    if (existing) return existing
    const text = entry.text
    entry.status = 'saving'
    entry.message = ''
    this.notify(slideId)
    const saving = this.save({ slideId, notes: text })
      .then(() => {
        if (entry.version !== version) return true
        entry.saved = text
        entry.status = 'saved'
        return true
      })
      .catch((error: unknown) => {
        if (entry.version !== version) return false
        entry.status = 'error'
        entry.message = message(error)
        this.failed(slideId, error)
        return false
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
