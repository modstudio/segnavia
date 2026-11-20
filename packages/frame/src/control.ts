// The base every styled component shares: how it finds its deck, how it
// redraws when the deck changes, and its labels. A component finds its
// controller, in order, from its `controller` property, from `for` (the id of
// a stage or player in the same document or shadow root), or from the
// nearest ancestor that has one, so it works beside a host's own controls.

import type { DeckController, DeckState } from './controller.ts'
import { upgradeProperties } from './element-properties.ts'
import { ENGLISH_LABELS, type PlayerLabels, playerLabels } from './labels.ts'
import type { Playback, PlaybackState } from './playback.ts'

interface HasController {
  controller: Playback | null
}

function isDeckController(controller: Playback | null): controller is DeckController {
  return (
    controller !== null &&
    'go' in controller &&
    'next' in controller &&
    'previous' in controller &&
    'present' in controller &&
    'stopPresenting' in controller &&
    'setCaptionsVisible' in controller &&
    'captionsPolicy' in controller
  )
}

function controllerOf(node: unknown): Playback | null {
  const candidate = (node as Partial<HasController> | null)?.controller
  return candidate && typeof candidate === 'object' && 'addEventListener' in candidate ? candidate : null
}

export abstract class SegnaviaControl extends HTMLElement {
  protected root = this.attachShadow({ mode: 'open' })
  private explicit: Playback | null = null
  private bound: Playback | null = null
  private words: PlayerLabels = ENGLISH_LABELS
  private drawn = false

  constructor() {
    super()
    upgradeProperties(this)
  }

  get controller(): DeckController | Playback | null {
    return this.bound
  }

  set controller(controller: DeckController | Playback | null) {
    this.explicit = controller
    this.bind(controller)
  }

  protected get playback(): Playback | null {
    return this.bound
  }

  protected get deckController(): DeckController | null {
    return isDeckController(this.bound) ? this.bound : null
  }

  protected get deckState(): DeckState | null {
    return this.deckController?.state ?? null
  }

  get labels(): PlayerLabels {
    return this.words
  }

  set labels(labels: Partial<PlayerLabels>) {
    this.words = playerLabels(labels)
    if (this.bound && (this.bound.state.playable || this.bound.state.deck)) this.render(this.bound.state)
  }

  protected abstract styles(): string
  protected abstract markup(): string
  protected abstract render(state: PlaybackState): void

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

  private find(): Playback | null {
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

  private bind(controller: Playback | null) {
    if (controller === this.bound) return
    this.bound?.removeEventListener('change', this.onChange)
    this.bound = controller
    controller?.addEventListener('change', this.onChange)
    if (controller && (controller.state.playable || controller.state.deck)) this.render(controller.state)
  }

  private onChange = (event: Event) => this.render((event as CustomEvent<PlaybackState>).detail)
}

export abstract class SegnaviaDeckControl extends SegnaviaControl {
  protected render(_state: PlaybackState) {
    const state = this.deckState
    if (state) this.renderDeck(state)
  }

  protected abstract renderDeck(state: DeckState): void
}
