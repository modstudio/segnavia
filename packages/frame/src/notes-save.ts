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
  inflight: Promise<boolean> | null
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
    return [...this.entries.values()].some((entry) => entry.text !== entry.saved || entry.inflight !== null)
  }

  setSave(save: (input: { slideId: string; notes: string }) => Promise<void>) {
    this.save = save
  }

  hasLocalWork(slideId: string): boolean {
    const entry = this.entry(slideId)
    return entry.text !== entry.saved || entry.inflight !== null
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
        inflight: null,
        status: 'idle',
        message: '',
      })
      return true
    }
    if (existing.text !== existing.saved || existing.inflight !== null) return false
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

  draft(slideId: string): string | undefined {
    return this.entries.get(slideId)?.text
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
    if (entry.inflight || entry.text !== entry.saved) {
      const saved = await this.start(slideId, entry.version)
      return saved && entry.text === entry.saved
    }
    return true
  }

  async flushAll(): Promise<boolean> {
    const pending: Promise<boolean>[] = []
    for (const [slideId, entry] of this.entries) {
      if (entry.timer !== null) {
        this.timers.clear(entry.timer)
        entry.timer = null
      }
      if (entry.text !== entry.saved || entry.inflight) pending.push(this.start(slideId, entry.version))
    }
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

  private start(slideId: string, _version: number): Promise<boolean> {
    const entry = this.entry(slideId)
    if (entry.inflight) {
      return entry.inflight.then((ok) => {
        if (!ok || entry.text === entry.saved) return ok
        return this.start(slideId, entry.version)
      })
    }
    if (entry.text === entry.saved) return Promise.resolve(true)
    const running = this.pump(slideId)
    entry.inflight = running
    return running
  }

  private async pump(slideId: string): Promise<boolean> {
    const entry = this.entry(slideId)
    try {
      while (entry.text !== entry.saved) {
        const version = entry.version
        const text = entry.text
        entry.status = 'saving'
        entry.message = ''
        this.notify(slideId)
        try {
          await this.save({ slideId, notes: text })
          entry.saved = text
          if (entry.version === version) entry.status = 'saved'
        } catch (error: unknown) {
          if (entry.version !== version) continue
          entry.status = 'error'
          entry.message = message(error)
          this.failed(slideId, error)
          return false
        }
      }
      return true
    } finally {
      entry.inflight = null
      this.notify(slideId)
    }
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
