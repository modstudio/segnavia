export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Entry<Value> {
  value: Value
  saved: Value
  host: Value
  version: number
  inflight: Promise<boolean> | null
  status: SaveStatus
}

export class OptimisticSaveCore<Value, Input> {
  private entries = new Map<string, Entry<Value>>()
  private wasDirty = false

  constructor(
    private save: (input: Input) => Promise<void>,
    private input: (slideId: string, value: Value) => Input,
    private equal: (left: Value, right: Value) => boolean,
    private dirtyChanged: (dirty: boolean) => void,
    private changed: (slideId: string) => void = () => {},
    private failed: (slideId: string, error: unknown) => void = () => {},
  ) {}

  get dirty(): boolean {
    return [...this.entries.values()].some((entry) => this.unsettled(entry))
  }

  async setSave(save: (input: Input) => Promise<void>): Promise<boolean> {
    if (!(await this.flushAll())) return false
    this.save = save
    return true
  }

  seed(slideId: string, value: Value): boolean {
    const existing = this.entries.get(slideId)
    if (!existing) {
      this.entries.set(slideId, { value, saved: value, host: value, version: 0, inflight: null, status: 'idle' })
      return true
    }
    if (this.unsettled(existing) || this.equal(existing.host, value)) return false
    existing.host = value
    if (this.equal(existing.value, value)) return false
    existing.value = value
    existing.saved = value
    existing.status = 'idle'
    this.notify(slideId)
    return true
  }

  state(slideId: string): { value: Value; status: SaveStatus } {
    const entry = this.entry(slideId)
    return { value: entry.value, status: entry.status }
  }

  draft(slideId: string): Value | undefined {
    return this.entries.get(slideId)?.value
  }

  hasLocalWork(slideId: string): boolean {
    return this.unsettled(this.entry(slideId))
  }

  editDraft(slideId: string, value: Value) {
    const entry = this.entry(slideId)
    if (this.equal(entry.value, value)) return
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

  private unsettled(entry: Entry<Value>): boolean {
    return !this.equal(entry.value, entry.saved) || entry.inflight !== null
  }

  private entry(slideId: string): Entry<Value> {
    const entry = this.entries.get(slideId)
    if (!entry) throw new Error(`Save value for slide "${slideId}" was not initialized.`)
    return entry
  }

  private start(slideId: string): Promise<boolean> {
    const entry = this.entry(slideId)
    if (entry.inflight) {
      return entry.inflight.then((ok) => {
        if (!ok || this.equal(entry.value, entry.saved)) return ok
        return this.start(slideId)
      })
    }
    if (this.equal(entry.value, entry.saved)) return Promise.resolve(true)
    const running = this.pump(slideId)
    entry.inflight = running
    return running
  }

  private async pump(slideId: string): Promise<boolean> {
    const entry = this.entry(slideId)
    try {
      while (!this.equal(entry.value, entry.saved)) {
        const version = entry.version
        const value = entry.value
        entry.status = 'saving'
        this.notify(slideId)
        try {
          await this.save(this.input(slideId, value))
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
