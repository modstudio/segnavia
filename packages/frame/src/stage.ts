// <segnavia-stage>: shows the current slide of a DeckController, scaled to
// fit the box the host gives it, with a shot's annotations shown on cue. It
// draws no controls and brings no appearance: a host styles it, and builds
// its own controls from `stage.controller`.
//
// Give it a controller, or a deck: attributes src, hash ("off" to leave the
// address alone) and prefetch create one. `unstyled` drops even the geometry. Keys pressed on the stage, or inside
// a slide (through the bridge), go to the controller in reading direction.
// State is mirrored as data attributes for styling: data-slide, data-playing,
// data-word, data-shown, data-direction.

import { firstStrongDirection } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { frameDocument, MESSAGE, messageFrom, newNonce } from './bridge.ts'
import { DeckController, type DeckState, type ResolvedContent } from './controller.ts'
import { annotationSvg } from './svg.ts'

export class SegnaviaStage extends HTMLElement {
  static observedAttributes = ['src']
  // Styles applied inside every slide, such as a host's house style.
  css = ''
  cspExtra = ''
  private owned: DeckController | null = null
  private attached: DeckController | null = null
  private painted: ResolvedContent | null = null
  private resize = new ResizeObserver(() => this.fit())

  get controller(): DeckController | null {
    return this.attached
  }

  set controller(controller: DeckController | null) {
    this.attached?.removeEventListener('change', this.onChange)
    this.attached = controller
    this.painted = null
    controller?.addEventListener('change', this.onChange)
    if (controller?.state.deck) this.update(controller.state)
    // Styled components pointing at this stage with `for` connect on this.
    this.dispatchEvent(new CustomEvent('segnavia-controller', { bubbles: true, composed: true }))
  }

  connectedCallback() {
    // `unstyled` brings nothing at all, not even geometry; the host lays the
    // stage out itself, starting from BASE_CSS if it likes.
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.addEventListener('keydown', this.onKey)
    window.addEventListener('message', this.onMessage)
    this.resize.observe(this)
  }

  disconnectedCallback() {
    this.removeEventListener('keydown', this.onKey)
    window.removeEventListener('message', this.onMessage)
    this.resize.disconnect()
  }

  attributeChangedCallback(_: string, __: string | null, src: string | null) {
    if (!src) return
    if (!this.owned) {
      const hash = this.getAttribute('hash')
      this.owned = new DeckController({ hash: hash === 'off' ? null : (hash ?? 'slide-'), prefetch: this.hasAttribute('prefetch') })
      this.controller = this.owned
    }
    void this.owned.loadUrl(src)
  }

  private onChange = (event: Event) => this.update((event as CustomEvent<DeckState>).detail)

  private update(state: DeckState) {
    const deck = state.deck
    if (!deck || !state.content) return
    this.style.setProperty('--segnavia-aspect', `${deck.size.width} / ${deck.size.height}`)
    if (state.content !== this.painted) this.paint(state, state.content)
    for (const group of this.querySelectorAll<SVGGElement>('[data-annotation]')) {
      const shown = state.shown === null || state.shown.includes(Number(group.dataset.annotation))
      group.toggleAttribute('data-shown', shown)
    }
    this.dataset.slide = String(state.index + 1)
    this.dataset.playing = String(state.playing)
    this.dataset.word = state.word === null ? '' : String(state.word)
    this.dataset.shown = state.shown === null ? 'all' : state.shown.join(',')
    this.dataset.direction = state.direction
  }

  private paint(state: DeckState, content: ResolvedContent) {
    const deck = state.deck as NonNullable<DeckState['deck']>
    const { width, height } = deck.size
    this.painted = content
    const canvas = document.createElement('div')
    canvas.className = 'segnavia-stage__canvas'
    canvas.style.cssText = `width:${width}px;height:${height}px;margin:${-height / 2}px 0 0 ${-width / 2}px`
    if (content.kind === 'html' || content.kind === 'url') {
      const iframe = document.createElement('iframe')
      iframe.className = 'segnavia-stage__frame'
      iframe.setAttribute('sandbox', 'allow-scripts')
      iframe.title = `Slide ${state.index + 1}`
      if (content.kind === 'html') {
        iframe.srcdoc = frameDocument(content.html, {
          scripts: deck.scripts,
          nonce: newNonce(),
          dir: deck.dir,
          lang: deck.lang,
          css: this.css,
          csp: this.cspExtra || undefined,
          reportHeight: false,
        })
      } else iframe.src = this.attached?.url(content.src) ?? content.src
      canvas.append(iframe)
    } else {
      // Content goes in as properties, never markup, so nothing a slide holds
      // is parsed as part of the page.
      const image = document.createElement('img')
      image.className = 'segnavia-stage__image'
      image.src = this.attached?.url(content.src) ?? content.src
      image.alt = content.kind === 'image' ? content.alt : content.shot.title
      const alt = image.alt
      image.dir = firstStrongDirection(alt) ?? 'auto'
      canvas.append(image)
      if (content.kind === 'shot') {
        const layer = document.createElement('div')
        layer.className = 'segnavia-stage__annotations'
        layer.innerHTML = annotationSvg(content.shot.size, content.shot.annotations, 'currentColor')
        canvas.append(layer)
      }
    }
    this.replaceChildren(canvas)
    this.fit()
  }

  private fit() {
    const deck = this.attached?.state.deck
    const canvas = this.querySelector<HTMLElement>('.segnavia-stage__canvas')
    if (!deck || !canvas) return
    canvas.style.transform = `scale(${Math.min(this.clientWidth / deck.size.width, this.clientHeight / deck.size.height)})`
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.target !== this) return
    if (this.attached?.key(event.key)) event.preventDefault()
  }

  // A key pressed inside the slide reaches the stage only through the bridge.
  private onMessage = (event: MessageEvent) => {
    const message = messageFrom(event, this.querySelector('iframe'))
    if (message?.type === MESSAGE.key && message.key) this.attached?.key(message.key)
  }
}
