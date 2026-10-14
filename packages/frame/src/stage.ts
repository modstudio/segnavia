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

import { ensureBaseStyle } from './base-style.ts'
import { MESSAGE, messageFrom } from './bridge.ts'
import { DeckController, type DeckState } from './controller.ts'
import { type FittedSize, fitSheet } from './fit.ts'
import { FramePool } from './frame-pool.ts'
import { defaultFrameTitle, type FrameTitle } from './frame-title.ts'

export interface StageReserve {
  blockStart?: number
  blockEnd?: number
}

export class SegnaviaStage extends HTMLElement {
  static observedAttributes = ['src', 'neighbors', 'fit']
  // Styles applied inside every slide, such as a host's house style.
  css = ''
  cspExtra = ''
  private owned: DeckController | null = null
  private attached: DeckController | null = null
  frameTitle: FrameTitle = defaultFrameTitle
  private room: StageReserve = {}
  private measured: FittedSize | null = null
  private resize = new ResizeObserver(() => this.measure())
  private pool = new FramePool(this, () => this.measure())

  // Neighbor frames mount only when author scripts are refused. A sandboxed
  // deck keeps one frame because a hidden running script could take page focus.
  get neighbors(): boolean {
    return this.hasAttribute('neighbors')
  }

  set neighbors(value: boolean) {
    this.toggleAttribute('neighbors', value)
  }

  get fit(): 'box' | 'viewport' {
    return this.getAttribute('fit') === 'viewport' ? 'viewport' : 'box'
  }

  set fit(value: 'box' | 'viewport') {
    if (value === 'viewport') this.setAttribute('fit', value)
    else this.removeAttribute('fit')
  }

  get reserve(): StageReserve {
    return { ...this.room }
  }

  set reserve(value: StageReserve) {
    this.room = { ...value }
    this.measure()
  }

  get fitted(): FittedSize | null {
    return this.measured
  }

  get controller(): DeckController | null {
    return this.attached
  }

  set controller(controller: DeckController | null) {
    this.attached?.removeEventListener('change', this.onChange)
    this.attached = controller
    if (this.isConnected) controller?.connectWindow()
    else controller?.disconnectWindow()
    this.pool.clear()
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
    window.addEventListener('resize', this.onResize)
    window.visualViewport?.addEventListener('resize', this.onResize)
    this.resize.observe(this)
    this.attached?.connectWindow()
    if (!this.owned) this.loadSource()
    if (this.attached?.state.deck) this.update(this.attached.state)
  }

  disconnectedCallback() {
    this.pool.cancelPending()
    this.removeEventListener('keydown', this.onKey)
    window.removeEventListener('message', this.onMessage)
    window.removeEventListener('resize', this.onResize)
    window.visualViewport?.removeEventListener('resize', this.onResize)
    this.resize.disconnect()
    if (this.owned) {
      this.owned.destroy()
      this.controller = null
      this.owned = null
    } else {
      this.attached?.stopPresenting()
      this.attached?.disconnectWindow()
    }
  }

  attributeChangedCallback(name: string, _: string | null, value: string | null) {
    if (name !== 'src') {
      if (this.attached?.state.deck) this.update(this.attached.state)
      this.measure()
      return
    }
    if (value) this.loadSource()
  }

  private onChange = (event: Event) => this.update((event as CustomEvent<DeckState>).detail)

  private loadSource() {
    const src = this.getAttribute('src')
    if (!src || !this.isConnected) return
    if (!this.owned) {
      const hash = this.getAttribute('hash')
      this.owned = new DeckController({ hash: hash === 'off' ? null : (hash ?? 'slide-'), prefetch: this.hasAttribute('prefetch') })
      this.controller = this.owned
    }
    void this.owned.loadUrl(src)
  }

  private update(state: DeckState) {
    const deck = state.deck
    if (!deck || !state.content) return
    this.style.setProperty('--segnavia-aspect', `${deck.size.width} / ${deck.size.height}`)
    this.pool.update(state, this.attached as DeckController, {
      neighbors: this.neighbors,
      css: this.css,
      csp: this.cspExtra,
      frameTitle: this.frameTitle,
    })
    const visible = this.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
    for (const group of visible?.querySelectorAll<SVGGElement>('[data-annotation]') ?? []) {
      const shown = state.shown === null || state.shown.includes(Number(group.dataset.annotation))
      group.toggleAttribute('data-shown', shown)
    }
    this.dataset.slide = String(state.index + 1)
    this.dataset.playing = String(state.playing)
    this.dataset.word = state.word === null ? '' : String(state.word)
    this.dataset.shown = state.shown === null ? 'all' : state.shown.join(',')
    this.dataset.direction = state.direction
  }

  private measure() {
    const deck = this.attached?.state.deck
    const canvas = this.querySelector<HTMLElement>('.segnavia-stage__canvas[data-active]')
    if (!deck || !canvas) return
    let fitted: FittedSize
    if (this.fit === 'viewport') {
      const style = getComputedStyle(this)
      const presenting = this.closest<HTMLElement>('[data-presenting]')
      const blockAvailable = presenting ? presenting.clientHeight : window.innerHeight - this.getBoundingClientRect().top
      fitted = fitSheet({
        width: this.clientWidth,
        height: blockAvailable,
        paddingInlineStart: Number.parseFloat(style.paddingInlineStart) || 0,
        paddingInlineEnd: Number.parseFloat(style.paddingInlineEnd) || 0,
        reserveBlockStart: this.room.blockStart ?? 0,
        reserveBlockEnd: this.room.blockEnd ?? 0,
        sheetWidth: deck.size.width,
        sheetHeight: deck.size.height,
      })
      this.style.blockSize = `${fitted.height}px`
    } else {
      const scale = Math.min(this.clientWidth / deck.size.width, this.clientHeight / deck.size.height)
      fitted = { scale, width: deck.size.width * scale, height: deck.size.height * scale }
      this.style.removeProperty('block-size')
    }
    for (const item of this.querySelectorAll<HTMLElement>('.segnavia-stage__canvas')) item.style.transform = `scale(${fitted.scale})`
    if (this.measured?.scale === fitted.scale && this.measured.width === fitted.width && this.measured.height === fitted.height) return
    this.measured = fitted
    this.dispatchEvent(new CustomEvent('segnavia-fit', { detail: fitted }))
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.target !== this || this.attached?.keys !== 'stage') return
    if (this.attached?.key(event.key)) event.preventDefault()
  }

  // A key pressed inside the slide reaches the stage only through the bridge.
  private onMessage = (event: MessageEvent) => {
    const message = messageFrom(event, this.pool.frames())
    if (message?.type === MESSAGE.key && message.key && event.source === this.pool.activeFrame()?.contentWindow) this.attached?.key(message.key)
  }

  private onResize = () => this.measure()
}
