export interface PrintMomentSaveState {
  value: number | null
  status: 'idle' | 'saving' | 'saved' | 'error'
}

interface Entry extends PrintMomentSaveState {
  saved: number | null
  host: number | null
  version: number
  inflight: Promise<boolean> | null
}

export class PrintMomentSaveQueue {
  private entries = new Map<string, Entry>()
  private wasDirty = false

  constructor(
    private save: (input: { slideId: string; printAtMs: number | null }) => Promise<void>,
    private dirtyChanged: (dirty: boolean) => void,
    private changed: (slideId: string) => void = () => {},
    private failed: (slideId: string, error: unknown) => void = () => {},
  ) {}

  get dirty(): boolean {
    return [...this.entries.values()].some((entry) => this.unsettled(entry))
  }

  setSave(save: (input: { slideId: string; printAtMs: number | null }) => Promise<void>) {
    this.save = save
  }

  seed(slideId: string, value: number | null): boolean {
    const existing = this.entries.get(slideId)
    if (!existing) {
      this.entries.set(slideId, { value, saved: value, host: value, version: 0, inflight: null, status: 'idle' })
      return true
    }
    if (this.unsettled(existing) || existing.host === value) return false
    existing.host = value
    if (existing.value === value) return false
    existing.value = value
    existing.saved = value
    existing.status = 'idle'
    this.notify(slideId)
    return true
  }

  state(slideId: string): PrintMomentSaveState {
    const entry = this.entry(slideId)
    return { value: entry.value, status: entry.status }
  }

  draft(slideId: string): number | null | undefined {
    return this.entries.get(slideId)?.value
  }

  edit(slideId: string, value: number | null) {
    this.editDraft(slideId, value)
    void this.start(slideId)
  }

  editDraft(slideId: string, value: number | null) {
    const entry = this.entry(slideId)
    if (entry.value === value) return
    entry.value = value
    entry.version++
    entry.status = 'idle'
    this.notify(slideId)
  }

  async flush(slideId: string): Promise<boolean> {
    return this.unsettled(this.entry(slideId)) ? this.start(slideId) : true
  }

  async flushAll(): Promise<boolean> {
    const pending = [...this.entries].filter(([, entry]) => this.unsettled(entry)).map(([slideId]) => this.start(slideId))
    const results = await Promise.all(pending)
    return results.every(Boolean) && !this.dirty
  }

  private unsettled(entry: Entry): boolean {
    return entry.value !== entry.saved || entry.inflight !== null
  }

  private entry(slideId: string): Entry {
    const entry = this.entries.get(slideId)
    if (!entry) throw new Error(`Print moment for slide "${slideId}" was not initialized.`)
    return entry
  }

  private start(slideId: string): Promise<boolean> {
    const entry = this.entry(slideId)
    if (entry.inflight) {
      return entry.inflight.then((ok) => {
        if (!ok || entry.value === entry.saved) return ok
        return this.start(slideId)
      })
    }
    if (entry.value === entry.saved) return Promise.resolve(true)
    const running = this.pump(slideId)
    entry.inflight = running
    return running
  }

  private async pump(slideId: string): Promise<boolean> {
    const entry = this.entry(slideId)
    try {
      while (entry.value !== entry.saved) {
        const version = entry.version
        const value = entry.value
        entry.status = 'saving'
        this.notify(slideId)
        try {
          await this.save({ slideId, printAtMs: value })
          entry.saved = value
          if (entry.version === version) entry.status = 'saved'
        } catch (error: unknown) {
          if (entry.version !== version) continue
          entry.status = 'error'
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
