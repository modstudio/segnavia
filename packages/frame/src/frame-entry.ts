import type { ContentValue } from './content-value.ts'
import type { ResolvedContent } from './controller.ts'

export interface FrameReadinessOptions {
  bridgeReadyTimeoutMs: number
  reportSlideError: (slideId: string, message: string) => void
}

export type FrameReadiness = 'waiting' | 'ready' | 'failed'

export class FrameEntry {
  canvas!: HTMLElement
  loaded = false
  ready: FrameReadiness = 'waiting'
  private readyTimeout: ReturnType<typeof setTimeout> | undefined
  private displayWaiters = new Set<() => void>()
  private selectionWaiters = new Set<() => void>()

  constructor(
    readonly id: string,
    readonly value: ContentValue,
    readonly content: ResolvedContent,
  ) {}

  markLoaded(options: FrameReadinessOptions) {
    if (this.loaded) return
    this.loaded = true
    this.releaseDisplayWaiters()
    this.releaseSelectionWaiters()
    if (this.value.content.kind === 'url' && this.value.content.bridge && this.ready === 'waiting') {
      this.readyTimeout = setTimeout(() => {
        this.readyTimeout = undefined
        this.ready = 'failed'
        options.reportSlideError(
          this.id,
          `Slide "${this.id}" loaded a document that did not report ready within ${options.bridgeReadyTimeoutMs} ms; serve the document with Segnavia's bridge, or drop bridge: true.`,
        )
      }, options.bridgeReadyTimeoutMs)
    }
  }

  markReady() {
    this.ready = 'ready'
    this.cancelReadyTimeout()
    this.releaseDisplayWaiters()
    this.releaseSelectionWaiters()
  }

  releaseReadinessWait() {
    this.cancelReadyTimeout()
  }

  dispose() {
    this.cancelReadyTimeout()
    this.displayWaiters.clear()
    this.selectionWaiters.clear()
  }

  get displayReady(): boolean {
    const waitsForBridge = this.value.content.kind === 'html' || (this.value.content.kind === 'url' && this.value.content.bridge === true)
    return this.loaded && (!waitsForBridge || this.ready === 'ready')
  }

  waitForDisplay(waiter: () => void): () => void {
    if (this.displayReady) {
      waiter()
      return () => {}
    }
    this.displayWaiters.add(waiter)
    return () => this.displayWaiters.delete(waiter)
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

  private releaseDisplayWaiters() {
    if (!this.displayReady) return
    for (const waiter of this.displayWaiters) waiter()
    this.displayWaiters.clear()
  }

  private selectionReady(): boolean {
    return this.loaded && (this.value.content.kind !== 'url' || !this.value.content.bridge || this.ready === 'ready')
  }

  private cancelReadyTimeout() {
    if (this.readyTimeout !== undefined) clearTimeout(this.readyTimeout)
    this.readyTimeout = undefined
  }
}
