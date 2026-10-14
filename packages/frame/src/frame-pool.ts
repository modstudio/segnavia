import { type ContentValue, comparableContent, sameContent } from './content-value.ts'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { frameWindow } from './deck-window.ts'
import type { FrameTitle } from './frame-title.ts'
import { stageCanvas } from './stage-content.ts'
import { type HostTransition, type TurnTransition, transitionFor } from './transition.ts'

interface PoolOptions {
  neighbors: boolean
  css: string
  csp: string
  frameTitle: FrameTitle
  transition?: HostTransition
  reducedMotion: boolean
}

interface PendingTurn {
  id: string
  visibleId: string
  running: boolean
  cancel: () => void
}

export class FramePool {
  private entries = new Map<string, { canvas: HTMLElement; value: ContentValue }>()
  private turn = 0
  private deck: DeckState['deck'] = null
  private pending: PendingTurn | null = null

  constructor(
    private host: HTMLElement,
    private changed: () => void,
  ) {}

  clear() {
    this.cancelPending()
    this.turn++
    this.entries.clear()
    this.deck = null
    this.host.replaceChildren()
  }

  update(state: DeckState, controller: DeckController, options: PoolOptions) {
    const deck = state.deck
    if (!deck || !state.slide || !state.content) return
    const reloaded = deck !== this.deck
    this.deck = deck
    if (this.updateTurn(state, controller, options)) {
      this.changed()
      return
    }
    this.cancelPending()
    const indexes = frameWindow(state.index, deck.slides.length, options.neighbors, deck.scripts)
    const wanted = new Set(indexes.map((index) => deck.slides[index]?.id))
    for (const [id, entry] of this.entries) {
      if (!wanted.has(id)) {
        entry.canvas.remove()
        this.entries.delete(id)
      }
    }
    this.add(state.index, state.content, state, controller, options)
    this.sync(state, options.frameTitle)
    const turn = ++this.turn
    for (const index of indexes) {
      if (index === state.index) continue
      const slide = deck.slides[index]
      if (!slide || (!reloaded && this.entries.has(slide.id))) continue
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
    this.changed()
  }

  frames(): HTMLIFrameElement[] {
    return [...this.host.querySelectorAll<HTMLIFrameElement>('iframe')]
  }

  activeFrame(): HTMLIFrameElement | null {
    return this.host.querySelector<HTMLIFrameElement>('.segnavia-stage__canvas[data-active] iframe')
  }

  cancelPending() {
    this.pending?.cancel()
    this.pending = null
  }

  private updateTurn(state: DeckState, controller: DeckController, options: PoolOptions): boolean {
    const deck = state.deck
    const slide = state.slide
    if (!deck || !slide || !state.content) return false
    if (this.pending?.id === slide.id) {
      const pending = this.entries.get(slide.id)
      const value = comparableContent(state.content, (path) => controller.url(path), deck.scripts, options.css, options.csp)
      if (pending && sameContent(pending.value, value)) return true
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
    if (transition.kind === 'none') return deck.scripts === 'sandboxed' && this.updateSandboxed(state, controller, options)

    const value = comparableContent(state.content, (path) => controller.url(path), deck.scripts, options.css, options.csp)
    const existing = this.entries.get(slide.id)
    const ready = deck.scripts === 'refuse' && Boolean(existing && sameContent(existing.value, value))
    const incoming = this.add(state.index, state.content, state, controller, options, false)
    if (!incoming) return true
    this.beginSwap(slide.id, activeId, incoming, controller, options.frameTitle, transition, options.neighbors, ready)
    this.retain(state, fromIndex, options.neighbors)
    this.sync(state, options.frameTitle)
    this.host.append(incoming)
    return true
  }

  private updateSandboxed(state: DeckState, controller: DeckController, options: PoolOptions): boolean {
    const deck = state.deck
    const slide = state.slide
    if (!deck || !slide || !state.content) return true
    const active = this.host.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
    const activeId = active?.dataset.slideId
    if (activeId && activeId !== slide.id) {
      const value = comparableContent(state.content, (path) => controller.url(path), deck.scripts, options.css, options.csp)
      const pending = this.entries.get(slide.id)
      if (this.pending?.id === slide.id && pending && sameContent(pending.value, value)) return true
      this.cancelPending()
      const incoming = this.add(state.index, state.content, state, controller, options, false)
      if (!incoming) return true
      this.beginSwap(slide.id, activeId, incoming, controller, options.frameTitle, null, false, false)
      this.retain(
        state,
        deck.slides.findIndex((candidate) => candidate.id === activeId),
        options.neighbors,
      )
      this.sync(state, options.frameTitle)
      this.host.append(incoming)
      return true
    }
    this.cancelPending()
    this.add(state.index, state.content, state, controller, options)
    this.retain(state, state.index, options.neighbors)
    this.sync(state, options.frameTitle)
    return true
  }

  private beginSwap(
    id: string,
    visibleId: string,
    incoming: HTMLElement,
    controller: DeckController,
    frameTitle: FrameTitle,
    transition: TurnTransition | null,
    neighbors: boolean,
    ready: boolean,
  ) {
    const media = incoming.querySelector('iframe, img')
    let firstFrame = 0
    let secondFrame = 0
    let timeout = 0
    let settled = false
    let animationTimeout = 0
    let animationFrame = 0
    const finish = () => {
      if (settled || this.pending?.id !== id) return
      settled = true
      cleanup()
      this.pending = null
      this.clearTransitionAttributes()
      this.retain(controller.state, controller.state.index, neighbors)
      this.sync(controller.state, frameTitle)
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
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(animate)
      })
    }
    const cleanup = () => {
      media?.removeEventListener('load', painted)
      if (firstFrame) cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
      if (timeout) clearTimeout(timeout)
      if (animationTimeout) clearTimeout(animationTimeout)
      if (animationFrame) cancelAnimationFrame(animationFrame)
    }
    if (ready) painted()
    else media?.addEventListener('load', painted, { once: true })
    // Measured complete turns in local Chromium stay below 100 ms; 250 ms leaves
    // more than twice that headroom without letting a broken frame stall a turn.
    if (!ready) timeout = window.setTimeout(transition ? animate : finish, TURN_SWAP_TIMEOUT_MS)
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
          this.changed()
        } else {
          settled = true
          cleanup()
          incoming.remove()
          this.entries.delete(id)
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
      canvas.style.setProperty('--segnavia-transition-scale', canvas.style.transform.match(/scale\(([^)]+)\)/)?.[1] ?? '1')
    }
    outgoing.dataset.leaving = ''
    incoming.dataset.entering = ''
  }

  private clearTransitionAttributes() {
    for (const canvas of this.entries.values()) {
      for (const name of ['data-transition', 'data-axis', 'data-entering', 'data-leaving', 'data-running']) canvas.canvas.removeAttribute(name)
      canvas.canvas.style.removeProperty('--segnavia-transition-duration')
      canvas.canvas.style.removeProperty('--segnavia-transition-scale')
    }
  }

  private retain(state: DeckState, index: number, neighbors: boolean) {
    const deck = state.deck
    if (!deck) return
    const wanted = new Set(frameWindow(index, deck.slides.length, neighbors, deck.scripts).map((candidate) => deck.slides[candidate]?.id))
    if (this.pending) wanted.add(this.pending.id)
    for (const [id, entry] of this.entries) {
      if (!wanted.has(id)) {
        entry.canvas.remove()
        this.entries.delete(id)
      }
    }
  }

  private add(index: number, content: ResolvedContent, state: DeckState, controller: DeckController, options: PoolOptions, mount = true): HTMLElement | null {
    const deck = state.deck
    const slide = deck?.slides[index]
    if (!deck || !slide) return null
    const existing = this.entries.get(slide.id)
    const comparable = comparableContent(content, (path) => controller.url(path), deck.scripts, options.css, options.csp)
    if (existing && sameContent(existing.value, comparable)) return existing.canvas
    const canvas = stageCanvas(controller, deck, slide, index, content, options.css, options.csp, options.frameTitle)
    this.entries.set(slide.id, { canvas, value: comparable })
    if (existing) existing.canvas.replaceWith(canvas)
    else if (mount) this.host.append(canvas)
    return canvas
  }

  private sync(state: DeckState, frameTitle: FrameTitle) {
    const deck = state.deck
    if (!deck || !state.slide) return
    for (const [index, slide] of deck.slides.entries()) {
      const canvas = this.entries.get(slide.id)?.canvas
      if (!canvas) continue
      const incoming = slide.id === this.pending?.id
      const visible = this.pending ? slide.id === this.pending.visibleId : slide.id === state.slide.id
      canvas.toggleAttribute('data-active', visible)
      canvas.toggleAttribute('data-incoming', incoming)
      canvas.setAttribute('aria-hidden', String(!visible))
      canvas.inert = !visible
      const frame = canvas.querySelector('iframe')
      if (frame) frame.title = frameTitle(deck.title, index + 1)
    }
  }
}

export const TURN_SWAP_TIMEOUT_MS = 250
