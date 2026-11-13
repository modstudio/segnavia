import type { ContentValue } from './content-value.ts'
import type { ResolvedContent } from './controller.ts'
import { SlideFrameError } from './slide-frame-error.ts'

export interface FrameReadinessOptions {
  bridgeReadyTimeoutMs: number
  reportSlideError: (slideId: string, error: Error) => void
}

// A bridged document that has not said ready yet may still say it, so this
// failure, unlike a document that could not be written, is one a late ready
// recovers.
export class BridgeReadyTimeoutError extends Error {
  constructor(slideId: string, timeoutMs: number) {
    super(
      `Slide "${slideId}" loaded a document that did not report ready within ${timeoutMs} ms; serve the document with Segnavia's bridge, or drop bridge: true.`,
    )
    this.name = 'BridgeReadyTimeoutError'
  }
}

export type FrameReadiness = 'waiting' | 'ready' | 'failed'

export class FrameEntry {
  canvas!: HTMLElement
  loaded = false
  ready: FrameReadiness = 'waiting'
  failure: Error | null = null
  private readyTimeout: ReturnType<typeof setTimeout> | undefined
  private loadWaiters = new Set<() => void>()
  private selectionWaiters = new Set<() => void>()

  constructor(
    readonly id: string,
    readonly value: ContentValue,
    readonly content: ResolvedContent,
  ) {}

  markLoaded(options: FrameReadinessOptions) {
    if (this.loaded) return
    this.loaded = true
    for (const waiter of this.loadWaiters) waiter()
    this.loadWaiters.clear()
    this.releaseSelectionWaiters()
    if (this.value.content.kind === 'url' && this.value.content.bridge && this.ready === 'waiting') {
      this.readyTimeout = setTimeout(() => {
        this.readyTimeout = undefined
        const failure = new BridgeReadyTimeoutError(this.id, options.bridgeReadyTimeoutMs)
        this.markFailed(failure)
        options.reportSlideError(this.id, failure)
      }, options.bridgeReadyTimeoutMs)
    }
  }

  markReady() {
    this.ready = 'ready'
    if (this.failure instanceof BridgeReadyTimeoutError || (this.failure instanceof SlideFrameError && this.failure.cause instanceof BridgeReadyTimeoutError))
      this.failure = null
    this.cancelReadyTimeout()
    this.releaseSelectionWaiters()
  }

  markFailed(error: Error) {
    this.failure = error
    this.ready = 'failed'
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
    return this.loaded && (this.value.content.kind !== 'url' || !this.value.content.bridge || this.ready === 'ready')
  }

  private cancelReadyTimeout() {
    if (this.readyTimeout !== undefined) clearTimeout(this.readyTimeout)
    this.readyTimeout = undefined
  }
}
