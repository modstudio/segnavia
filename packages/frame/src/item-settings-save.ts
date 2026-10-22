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
  version: number
  inflight: Promise<boolean> | null
}

export class FillSaveQueue {
  private entries = new Map<string, Entry>()
  private timers = new Map<string, number>()

  constructor(
    private save: (fill: Fill) => Promise<void>,
    private rolledBack: (fill: Fill) => void,
    private failed: (id: string, error: unknown) => void,
    private time: Timers = browserTimers,
  ) {}

  setSave(save: (fill: Fill) => Promise<void>) {
    this.save = save
  }

  seed(fill: Fill) {
    const existing = this.entries.get(fill.id)
    if (existing?.inflight || (existing && !sameFill(existing.draft, existing.saved))) return
    this.entries.set(fill.id, { draft: cloneFill(fill), saved: cloneFill(fill), version: 0, inflight: null })
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

  dispose() {
    for (const id of [...this.timers.keys()]) this.clearTimer(id)
  }

  private start(entry: Entry): Promise<boolean> {
    if (entry.inflight) {
      return entry.inflight.then((ok) => {
        if (!ok || sameFill(entry.draft, entry.saved)) return ok
        return this.start(entry)
      })
    }
    if (sameFill(entry.draft, entry.saved)) return Promise.resolve(true)
    const running = this.pump(entry)
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
          this.rolledBack(cloneFill(entry.saved))
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
}
