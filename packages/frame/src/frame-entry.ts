import type { ContentValue } from './content-value.ts'

export interface FrameReadinessOptions {
  bridgeReadyTimeoutMs: number
  reportError: (error: Error) => void
}

export class FrameEntry {
  canvas!: HTMLElement
  loaded = false
  private ready = false
  private readyTimeout: ReturnType<typeof setTimeout> | undefined
  private loadWaiters = new Set<() => void>()

  constructor(
    readonly id: string,
    readonly value: ContentValue,
  ) {}

  markLoaded(options: FrameReadinessOptions) {
    if (this.loaded) return
    this.loaded = true
    for (const waiter of this.loadWaiters) waiter()
    this.loadWaiters.clear()
    if (this.value.content.kind === 'url' && this.value.content.bridge && !this.ready) {
      this.readyTimeout = setTimeout(() => {
        this.readyTimeout = undefined
        options.reportError(
          new Error(
            `Slide "${this.id}" loaded a document that did not report ready within ${options.bridgeReadyTimeoutMs} ms; serve the document with Segnavia's bridge, or drop bridge: true.`,
          ),
        )
      }, options.bridgeReadyTimeoutMs)
    }
  }

  markReady() {
    this.ready = true
    this.cancelReadyTimeout()
  }

  dispose() {
    this.cancelReadyTimeout()
    this.loadWaiters.clear()
  }

  waitForLoad(waiter: () => void): () => void {
    if (this.loaded) {
      waiter()
      return () => {}
    }
    this.loadWaiters.add(waiter)
    return () => this.loadWaiters.delete(waiter)
  }

  private cancelReadyTimeout() {
    if (this.readyTimeout !== undefined) clearTimeout(this.readyTimeout)
    this.readyTimeout = undefined
  }
}
