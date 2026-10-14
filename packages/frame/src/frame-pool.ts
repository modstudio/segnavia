import type { DeckController, DeckState, ResolvedContent } from './controller.ts'
import { neighborWindow } from './deck-window.ts'
import { type FrameTitle, stageCanvas } from './stage-content.ts'

interface PoolOptions {
  neighbors: boolean
  css: string
  csp: string
  frameTitle: FrameTitle
}

export class FramePool {
  private entries = new Map<string, HTMLElement>()
  private turn = 0

  constructor(
    private host: HTMLElement,
    private changed: () => void,
  ) {}

  clear() {
    this.turn++
    this.entries.clear()
    this.host.replaceChildren()
  }

  update(state: DeckState, controller: DeckController, options: PoolOptions) {
    const deck = state.deck
    if (!deck || !state.slide || !state.content) return
    const indexes = options.neighbors ? neighborWindow(state.index, deck.slides.length) : [state.index]
    const wanted = new Set(indexes.map((index) => deck.slides[index]?.id))
    for (const [id, canvas] of this.entries) {
      if (!wanted.has(id)) {
        canvas.remove()
        this.entries.delete(id)
      }
    }
    this.add(state.index, state.content, state, controller, options)
    this.sync(state, options.frameTitle)
    const turn = ++this.turn
    for (const index of indexes.slice(1)) {
      const slide = deck.slides[index]
      if (!slide || this.entries.has(slide.id)) continue
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

  private add(index: number, content: ResolvedContent, state: DeckState, controller: DeckController, options: PoolOptions) {
    const deck = state.deck
    const slide = deck?.slides[index]
    if (!deck || !slide || this.entries.has(slide.id)) return
    const canvas = stageCanvas(controller, deck, slide, index, content, options.css, options.csp, options.frameTitle)
    this.entries.set(slide.id, canvas)
    this.host.append(canvas)
  }

  private sync(state: DeckState, frameTitle: FrameTitle) {
    const deck = state.deck
    if (!deck || !state.slide) return
    for (const [index, slide] of deck.slides.entries()) {
      const canvas = this.entries.get(slide.id)
      if (!canvas) continue
      const visible = slide.id === state.slide.id
      canvas.toggleAttribute('data-active', visible)
      canvas.setAttribute('aria-hidden', String(!visible))
      const frame = canvas.querySelector('iframe')
      if (frame) frame.title = frameTitle(deck.title, index + 1)
    }
  }
}
