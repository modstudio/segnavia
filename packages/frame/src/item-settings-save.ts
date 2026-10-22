import type { Fill } from '@segnavia/format'
import { cloneFill, sameFill } from './item-settings-fills.ts'

export const FILL_SAVE_DEBOUNCE_MS = 600

interface Timers {
  set(run: () => void, delay: number): number
  clear(timer: number): void
}

const browserTimers: Timers = {
  set: (run, delay) => globalThis.setTimeout(run, delay) as unknown as number,
  clear: (timer) => globalThis.clearTimeout(timer),
}

interface Entry {
  draft: Fill
  saved: Fill
  hostSnapshot?: Fill
  version: number
  inflight: Promise<boolean> | null
}

export class FillSaveQueue {
  private entries = new Map<string, Entry>()
  private timers = new Map<string, number>()
  private disposed = false

  constructor(
    private save: (fill: Fill) => Promise<void>,
    private replaceVisible: (fill: Fill) => void,
    private failed: (id: string, error: unknown) => void,
    private time: Timers = browserTimers,
  ) {}

  setSave(save: (fill: Fill) => Promise<void>) {
    this.save = save
  }

  /**
   * Seeds a host value and returns the fill the panel should show for it: the
   * local draft while that fill is dirty or saving (the host value is kept and
   * adopted once the save settles cleanly), otherwise the host value itself.
   */
  seed(fill: Fill): Fill {
    const existing = this.entries.get(fill.id)
    if (existing?.inflight || (existing && !sameFill(existing.draft, existing.saved))) {
      existing.hostSnapshot = cloneFill(fill)
      return cloneFill(existing.draft)
    }
    this.entries.set(fill.id, { draft: cloneFill(fill), saved: cloneFill(fill), version: 0, inflight: null })
    return cloneFill(fill)
  }

  edit(fill: Fill) {
    const entry = this.entries.get(fill.id) ?? {
      draft: cloneFill(fill),
      saved: { id: fill.id, values: {} },
      version: 0,
      inflight: null,
    }
    this.entries.set(fill.id, entry)
    if (sameFill(entry.draft, fill) && sameFill(entry.saved, fill)) return
    entry.draft = cloneFill(fill)
    // An edit made after a host value was skipped is newer than it, so that
    // value must not replace the edit once the save settles.
    entry.hostSnapshot = undefined
    entry.version++
    this.clearTimer(fill.id)
    this.timers.set(
      fill.id,
      this.time.set(() => {
        this.timers.delete(fill.id)
        void this.flush(fill.id)
      }, FILL_SAVE_DEBOUNCE_MS),
    )
  }

  async flush(id: string): Promise<boolean> {
    this.clearTimer(id)
    const entry = this.entries.get(id)
    if (!entry) return true
    return this.start(entry)
  }

  async flushAll(): Promise<boolean> {
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
    const results = await Promise.all([...this.entries.values()].map((entry) => this.start(entry)))
    return results.every(Boolean)
  }

  drop(id: string) {
    this.clearTimer(id)
    this.entries.delete(id)
  }

  /** Forgets every fill the host no longer lists; their pending saves never fire. */
  retain(ids: ReadonlySet<string>) {
    for (const id of [...this.entries.keys()]) if (!ids.has(id)) this.drop(id)
  }

  /**
   * Stops timers and every visible write. A save already in flight still
   * finishes, but neither its rollback nor an adopted host value reaches a
   * panel this queue no longer belongs to.
   */
  dispose() {
    this.disposed = true
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
  }

  /** The one door to the visible list, shared by rollback and adoption. */
  private show(fill: Fill) {
    if (!this.disposed) this.replaceVisible(fill)
  }

  private start(entry: Entry): Promise<boolean> {
    if (entry.inflight) {
      return entry.inflight.then((ok) => {
        if (!ok || sameFill(entry.draft, entry.saved)) return ok
        return this.start(entry)
      })
    }
    if (sameFill(entry.draft, entry.saved)) return Promise.resolve(true)
    const running = this.pump(entry).then((ok) => {
      if (ok) this.adoptHostSnapshot(entry)
      return ok
    })
    entry.inflight = running
    return running
  }

  private async pump(entry: Entry): Promise<boolean> {
    try {
      while (!sameFill(entry.draft, entry.saved)) {
        const version = entry.version
        const value = cloneFill(entry.draft)
        try {
          await this.save(value)
          entry.saved = value
        } catch (error: unknown) {
          if (entry.version !== version) continue
          entry.draft = cloneFill(entry.saved)
          this.show(cloneFill(entry.saved))
          this.failed(entry.saved.id, error)
          return false
        }
      }
      return true
    } finally {
      entry.inflight = null
    }
  }

  private clearTimer(id: string) {
    const timer = this.timers.get(id)
    if (timer === undefined) return
    this.time.clear(timer)
    this.timers.delete(id)
  }

  private adoptHostSnapshot(entry: Entry) {
    const snapshot = entry.hostSnapshot
    entry.hostSnapshot = undefined
    if (!snapshot || sameFill(snapshot, entry.saved)) return
    entry.draft = cloneFill(snapshot)
    entry.saved = cloneFill(snapshot)
    this.show(cloneFill(snapshot))
  }
}
