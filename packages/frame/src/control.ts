// The base every styled component shares: how it finds its deck, how it
// redraws when the deck changes, and its labels. A component finds its
// controller, in order, from its `controller` property, from `for` (the id of
// a stage or player in the same document or shadow root), or from the
// nearest ancestor that has one, so it works beside a host's own controls.

import type { DeckController, DeckState } from './controller.ts'
import { ENGLISH_LABELS, type PlayerLabels } from './labels.ts'

interface HasController {
  controller: DeckController | null
}

function controllerOf(node: unknown): DeckController | null {
  const candidate = (node as Partial<HasController> | null)?.controller
  return candidate && typeof candidate === 'object' && 'addEventListener' in candidate ? candidate : null
}

export abstract class SegnaviaControl extends HTMLElement {
  protected root = this.attachShadow({ mode: 'open' })
  private explicit: DeckController | null = null
  private bound: DeckController | null = null
  private words: PlayerLabels = ENGLISH_LABELS
  private drawn = false

  get controller(): DeckController | null {
    return this.bound
  }

  set controller(controller: DeckController | null) {
    this.explicit = controller
    this.bind(controller)
  }

  get labels(): PlayerLabels {
    return this.words
  }

  set labels(labels: PlayerLabels) {
    this.words = labels
    if (this.bound?.state.deck) this.render(this.bound.state)
  }

  protected abstract styles(): string
  protected abstract markup(): string
  protected abstract render(state: DeckState): void

  connectedCallback() {
    if (!this.drawn) {
      this.root.innerHTML = `<style>${this.styles()}</style>${this.markup()}`
      this.drawn = true
      this.root.addEventListener('click', (event) => this.clicked(event))
    }
    this.connect()
    document.addEventListener('segnavia-controller', this.connect)
  }

  disconnectedCallback() {
    document.removeEventListener('segnavia-controller', this.connect)
  }

  protected clicked(_event: Event) {}

  private connect = () => {
    if (this.explicit) return this.bind(this.explicit)
    this.bind(this.find())
  }

  private find(): DeckController | null {
    const id = this.getAttribute('for')
    if (id) {
      const root = this.getRootNode() as Document | ShadowRoot
      return controllerOf(root.getElementById(id))
    }
    for (let node: Node | null = this.parentNode; node; node = node instanceof ShadowRoot ? node.host : node.parentNode) {
      const found = controllerOf(node)
      if (found) return found
    }
    return null
  }

  private bind(controller: DeckController | null) {
    if (controller === this.bound) return
    this.bound?.removeEventListener('change', this.onChange)
    this.bound = controller
    controller?.addEventListener('change', this.onChange)
    if (controller?.state.deck) this.render(controller.state)
  }

  private onChange = (event: Event) => this.render((event as CustomEvent<DeckState>).detail)
}
