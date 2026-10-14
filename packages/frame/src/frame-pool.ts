import { comparableContent, sameContent } from './content-value.ts'
import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { neighborWindow } from './deck-window.ts'
import type { FrameTitle } from './frame-title.ts'
import { stageCanvas } from './stage-content.ts'

interface PoolOptions {
  neighbors: boolean
  css: string
  csp: string
  frameTitle: FrameTitle
}

export class FramePool {
  private entries = new Map<string, { canvas: HTMLElement; content: ResolvedContent }>()
  private turn = 0
  private deck: DeckState['deck'] = null

  constructor(
    private host: HTMLElement,
    private changed: () => void,
  ) {}

  clear() {
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
    const indexes = options.neighbors ? neighborWindow(state.index, deck.slides.length) : [state.index]
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

  guardFocus(target: EventTarget | null = this.host.ownerDocument.activeElement) {
    if (!(target instanceof HTMLIFrameElement) || !this.host.contains(target)) return
    if (target.closest('.segnavia-stage__canvas')?.hasAttribute('data-active')) return
    target.blur()
    this.host.focus()
  }

  private add(index: number, content: ResolvedContent, state: DeckState, controller: DeckController, options: PoolOptions) {
    const deck = state.deck
    const slide = deck?.slides[index]
    if (!deck || !slide) return
    const existing = this.entries.get(slide.id)
    const comparable = comparableContent(content, (path) => controller.url(path))
    if (existing && sameContent(existing.content, comparable)) return
    const canvas = stageCanvas(controller, deck, slide, index, content, options.css, options.csp, options.frameTitle)
    this.entries.set(slide.id, { canvas, content: comparable })
    if (existing) existing.canvas.replaceWith(canvas)
    else this.host.append(canvas)
  }

  private sync(state: DeckState, frameTitle: FrameTitle) {
    const deck = state.deck
    if (!deck || !state.slide) return
    for (const [index, slide] of deck.slides.entries()) {
      const canvas = this.entries.get(slide.id)?.canvas
      if (!canvas) continue
      const visible = slide.id === state.slide.id
      canvas.toggleAttribute('data-active', visible)
      canvas.setAttribute('aria-hidden', String(!visible))
      canvas.inert = !visible
      const frame = canvas.querySelector('iframe')
      if (frame && !visible && frame === this.host.ownerDocument.activeElement) this.guardFocus(frame)
      if (frame) frame.title = frameTitle(deck.title, index + 1)
    }
  }
}
