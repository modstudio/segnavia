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
  private selectionWaiters = new Set<() => void>()

  constructor(
    readonly id: string,
    readonly value: ContentValue,
  ) {}

  markLoaded(options: FrameReadinessOptions) {
    if (this.loaded) return
    this.loaded = true
    for (const waiter of this.loadWaiters) waiter()
    this.loadWaiters.clear()
    this.releaseSelectionWaiters()
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
    this.releaseSelectionWaiters()
  }

  releaseReadinessWait() {
    this.cancelReadyTimeout()
  }

  dispose() {
    this.cancelReadyTimeout()
    this.loadWaiters.clear()
    this.selectionWaiters.clear()
  }

  waitForLoad(waiter: () => void): () => void {
    if (this.loaded) {
      waiter()
      return () => {}
    }
    this.loadWaiters.add(waiter)
    return () => this.loadWaiters.delete(waiter)
  }

  waitForSelection(waiter: () => void): () => void {
    if (this.selectionReady()) {
      waiter()
      return () => {}
    }
    this.selectionWaiters.add(waiter)
    return () => this.selectionWaiters.delete(waiter)
  }

  private releaseSelectionWaiters() {
    if (!this.selectionReady()) return
    for (const waiter of this.selectionWaiters) waiter()
    this.selectionWaiters.clear()
  }

  private selectionReady(): boolean {
    return this.loaded && (this.value.content.kind !== 'url' || !this.value.content.bridge || this.ready)
  }

  private cancelReadyTimeout() {
    if (this.readyTimeout !== undefined) clearTimeout(this.readyTimeout)
    this.readyTimeout = undefined
  }
}
