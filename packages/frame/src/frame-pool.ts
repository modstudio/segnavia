import { comparableContent } from './content-value.ts'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { frameWindow } from './deck-window.ts'
import type { FrameEntry } from './frame-entry.ts'
import { addFrame, canReuseFrame, type FrameEvents, removeFrame, syncFrames } from './frame-pool-entry.ts'
import type { PoolOptions } from './frame-pool-options.ts'
import { type TurnTransition, transitionFor } from './transition.ts'

interface PendingTurn {
  id: string
  visibleId: string
  running: boolean
  cancel: () => void
}

export class FramePool {
  private entries = new Map<string, FrameEntry>()
  private turn = 0
  private deck: DeckState['deck'] = null
  private pending: PendingTurn | null = null
  private controller: DeckController | null = null

  constructor(
    private host: HTMLElement,
    private changed: () => void,
    private frameEvents: FrameEvents,
  ) {}

  clear() {
    this.cancelPending()
    this.turn++
    for (const [id, entry] of this.entries) this.remove(id, entry)
    this.deck = null
    this.host.replaceChildren()
  }

  update(state: DeckState, controller: DeckController, options: PoolOptions) {
    const deck = state.deck
    if (!deck || !state.slide || !state.content) return
    this.controller = controller
    const reloaded = deck !== this.deck
    this.deck = deck
    if (this.updateTurn(state, controller, options)) {
      this.changed()
      return
    }
    this.cancelPending()
    const indexes = frameWindow(state.index, deck.slides.length, options.neighbors, deck.scripts)
    const wanted = new Set(indexes.map((index) => deck.slides[index]?.id))
    for (const [id, entry] of this.entries) if (!wanted.has(id)) this.remove(id, entry)
    this.add(state.index, state.content, state, controller, options)
    this.sync(state, options.frameTitle)
    this.mountWindow(state, controller, options, reloaded)
    this.changed()
  }

  frames(): HTMLIFrameElement[] {
    return [...this.host.querySelectorAll<HTMLIFrameElement>('iframe')]
  }

  activeFrame(): HTMLIFrameElement | null {
    return this.host.querySelector<HTMLIFrameElement>('.segnavia-stage__canvas[data-active] iframe')
  }

  shownFrame(slideId: string): HTMLIFrameElement | null {
    if (this.pending && this.pending.visibleId !== slideId) return null
    const canvas = this.entries.get(slideId)?.canvas
    if (!canvas?.matches('.segnavia-stage__canvas[data-active]')) return null
    return canvas.querySelector('iframe')
  }

  hasMountedFrame(slideId: string): boolean {
    return this.entries.get(slideId)?.canvas.isConnected === true
  }

  waitForActiveFrame(frame: HTMLIFrameElement, ready: () => void): () => void {
    for (const entry of this.entries.values()) {
      if (entry.canvas.querySelector('iframe') === frame) return entry.waitForSelection(ready)
    }
    return () => {}
  }

  markReady(source: MessageEventSource | null) {
    for (const entry of this.entries.values()) {
      const frame = entry.canvas.querySelector('iframe')
      if (frame?.contentWindow === source) entry.markReady()
    }
  }

  cancelPending() {
    this.pending?.cancel()
    this.pending = null
  }

  releaseWaits() {
    for (const entry of this.entries.values()) entry.releaseReadinessWait()
  }

  private updateTurn(state: DeckState, controller: DeckController, options: PoolOptions): boolean {
    const deck = state.deck
    const slide = state.slide
    if (!deck || !slide || !state.content) return false
    if (this.pending?.id === slide.id) {
      const pending = this.entries.get(slide.id)
      const value = comparableContent(state.content, (path) => controller.url(path), deck.scripts, options.css, options.csp, options.dependencyOrigins)
      if (pending && canReuseFrame({ readiness: pending.ready, sameResolution: pending.content === state.content }, pending.value, value)) return true
    }
    this.cancelPending()
    const active = this.host.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
    const activeId = active?.dataset.slideId
    if (!activeId || activeId === slide.id) return deck.scripts === 'sandboxed' && this.updateSandboxed(state, controller, options)
    const fromIndex = deck.slides.findIndex((candidate) => candidate.id === activeId)
    const from = deck.slides[fromIndex]
    if (!from) return false
    const transition = transitionFor({
      deck,
      from,
      to: slide,
      direction: state.index >= fromIndex ? 'forward' : 'back',
      hostOverride: options.transition,
      reducedMotion: options.reducedMotion,
    })
    const value = comparableContent(state.content, (path) => controller.url(path), deck.scripts, options.css, options.csp, options.dependencyOrigins)
    const existing = this.entries.get(slide.id)
    const reused =
      deck.scripts === 'refuse' &&
      Boolean(existing && canReuseFrame({ readiness: existing.ready, sameResolution: existing.content === state.content }, existing.value, value))
    const ready = reused && existing?.loaded === true
    if (transition.kind === 'none') {
      if (deck.scripts === 'sandboxed') return this.updateSandboxed(state, controller, options)
      if (ready || !reused) return false
      this.startSwap(state, controller, options, activeId, fromIndex, null, true)
      return true
    }
    this.startSwap(state, controller, options, activeId, fromIndex, transition, reused)
    return true
  }

  private updateSandboxed(state: DeckState, controller: DeckController, options: PoolOptions): boolean {
    const deck = state.deck
    const slide = state.slide
    if (!deck || !slide || !state.content) return true
    const active = this.host.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
    const activeId = active?.dataset.slideId
    if (activeId && activeId !== slide.id) {
      const value = comparableContent(state.content, (path) => controller.url(path), deck.scripts, options.css, options.csp, options.dependencyOrigins)
      const pending = this.entries.get(slide.id)
      if (
        this.pending?.id === slide.id &&
        pending &&
        canReuseFrame({ readiness: pending.ready, sameResolution: pending.content === state.content }, pending.value, value)
      )
        return true
      this.cancelPending()
      this.startSwap(
        state,
        controller,
        options,
        activeId,
        deck.slides.findIndex((candidate) => candidate.id === activeId),
        null,
        false,
      )
      return true
    }
    this.cancelPending()
    this.add(state.index, state.content, state, controller, options)
    this.retain(state, state.index, options.neighbors)
    this.sync(state, options.frameTitle)
    return true
  }

  private startSwap(
    state: DeckState,
    controller: DeckController,
    options: PoolOptions,
    activeId: string,
    fromIndex: number,
    transition: TurnTransition | null,
    reused: boolean,
  ) {
    const slide = state.slide
    if (!slide || !state.content) return
    this.turn++
    const mountAfterAttach = !this.entries.has(slide.id)
    const incoming = this.add(state.index, state.content, state, controller, options, false)
    if (!incoming) return
    const entry = this.entries.get(slide.id)
    if (!entry) return
    this.beginSwap(slide.id, activeId, entry, controller, options, transition, reused)
    this.retain(state, fromIndex, options.neighbors)
    this.sync(state, options.frameTitle)
    if (!incoming.isConnected) this.host.append(incoming)
    if (mountAfterAttach) this.frameEvents.mounted(entry.id, entry.content)
  }

  private beginSwap(
    id: string,
    visibleId: string,
    entry: FrameEntry,
    controller: DeckController,
    options: PoolOptions,
    transition: TurnTransition | null,
    reused: boolean,
  ) {
    const incoming = entry.canvas
    let firstFrame = 0
    let secondFrame = 0
    let timeout = 0
    let settled = false
    let animationTimeout = 0
    let animationFrame = 0
    let stopWaiting = () => {}
    const finish = () => {
      if (settled || this.pending?.id !== id) return
      settled = true
      cleanup()
      this.pending = null
      this.clearTransitionAttributes()
      this.retain(controller.state, controller.state.index, options.neighbors)
      this.sync(controller.state, options.frameTitle)
      this.mountWindow(controller.state, controller, options)
      this.changed()
    }
    const animate = () => {
      if (!transition || transition.duration === 0) return finish()
      const outgoing = this.entries.get(visibleId)?.canvas
      if (!outgoing) return finish()
      this.setTransitionAttributes(outgoing, incoming, transition)
      // Commit the entering position before the next frame starts motion.
      incoming.getBoundingClientRect()
      ;(this.pending as PendingTurn).running = true
      animationFrame = requestAnimationFrame(() => {
        if (settled || this.pending?.id !== id) return
        outgoing.dataset.running = ''
        incoming.dataset.running = ''
        animationTimeout = window.setTimeout(finish, transition.duration + 50)
      })
    }
    const painted = () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = 0
      }
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(animate)
      })
    }
    const cleanup = () => {
      stopWaiting()
      if (firstFrame) cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
      if (timeout) clearTimeout(timeout)
      if (animationTimeout) clearTimeout(animationTimeout)
      if (animationFrame) cancelAnimationFrame(animationFrame)
    }
    if (entry.loaded) painted()
    else stopWaiting = entry.waitForLoad(painted)
    // Measured complete turns in local Chromium stay below 100 ms; 250 ms leaves
    // more than twice that headroom without letting a broken frame stall a turn.
    if (!entry.loaded) timeout = window.setTimeout(transition ? animate : finish, TURN_SWAP_TIMEOUT_MS)
    this.pending = {
      id,
      visibleId,
      running: false,
      cancel: () => {
        if (this.pending?.running) {
          settled = true
          cleanup()
          this.clearTransitionAttributes()
          const outgoing = this.entries.get(visibleId)?.canvas
          outgoing?.removeAttribute('data-active')
          if (outgoing) {
            outgoing.setAttribute('aria-hidden', 'true')
            outgoing.inert = true
          }
          incoming.dataset.active = ''
          incoming.setAttribute('aria-hidden', 'false')
          incoming.inert = false
          this.mountWindow(controller.state, controller, options)
          this.changed()
        } else if (!reused) {
          settled = true
          cleanup()
          this.remove(id, entry)
        } else {
          settled = true
          cleanup()
          this.clearTransitionAttributes()
          incoming.removeAttribute('data-incoming')
        }
      },
    }
  }

  private setTransitionAttributes(outgoing: HTMLElement, incoming: HTMLElement, transition: TurnTransition) {
    const duration = `${transition.duration}ms`
    for (const canvas of [outgoing, incoming]) {
      canvas.dataset.transition = transition.kind
      canvas.dataset.axis = transition.axis
      canvas.style.setProperty('--segnavia-transition-duration', duration)
    }
    outgoing.dataset.leaving = ''
    incoming.dataset.entering = ''
  }

  private clearTransitionAttributes() {
    for (const canvas of this.entries.values()) {
      for (const name of ['data-transition', 'data-axis', 'data-entering', 'data-leaving', 'data-running']) canvas.canvas.removeAttribute(name)
      canvas.canvas.style.removeProperty('--segnavia-transition-duration')
    }
  }

  private mountWindow(state: DeckState, controller: DeckController, options: PoolOptions, reload = false) {
    const deck = state.deck
    if (!deck) return
    const turn = ++this.turn
    for (const index of frameWindow(state.index, deck.slides.length, options.neighbors, deck.scripts)) {
      if (index === state.index) continue
      const slide = deck.slides[index]
      if (!slide || (!reload && this.entries.has(slide.id))) continue
      void controller
        .contentFor(index)
        .then((content) => {
          if (turn !== this.turn || controller.state.deck !== deck) return
          this.add(index, content, state, controller, options)
          this.sync(controller.state, options.frameTitle)
          this.changed()
        })
        .catch(() => {})
    }
  }

  private retain(state: DeckState, index: number, neighbors: boolean) {
    const deck = state.deck
    if (!deck) return
    const wanted = new Set(frameWindow(index, deck.slides.length, neighbors, deck.scripts).map((candidate) => deck.slides[candidate]?.id))
    if (this.pending) wanted.add(this.pending.id)
    for (const [id, entry] of this.entries) {
      if (!wanted.has(id)) {
        this.remove(id, entry)
      }
    }
  }

  private add(index: number, content: ResolvedContent, state: DeckState, controller: DeckController, options: PoolOptions, mount = true): HTMLElement | null {
    return addFrame({
      entries: this.entries,
      events: this.frameEvents,
      host: this.host,
      index,
      content,
      state,
      controller,
      pool: options,
      mount,
    })
  }

  private remove(id: string, entry: FrameEntry) {
    removeFrame(this.entries, this.controller, this.frameEvents, id, entry)
  }

  private sync(state: DeckState, frameTitle: PoolOptions['frameTitle']) {
    syncFrames(this.entries, this.pending, state, frameTitle)
  }
}

export const TURN_SWAP_TIMEOUT_MS = 250
