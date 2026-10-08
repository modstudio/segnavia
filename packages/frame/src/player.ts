// <segnavia-player>: the finished player, a layout of the styled components
// around a stage, for a host that wants to use the library as it is. A host
// that wants only some of it places the components itself; a host that wants
// none of it uses the headless stage and controller.
//
// Attributes: src · theme (auto | light | dark; auto by default) · notes
// (open the notes) · hash ("off" to leave the address alone) · prefetch.
// Properties: controller, resolveSlide, css, labels. Data attributes mirror
// the state for styling: data-slide, data-playing, data-word, data-shown,
// data-direction.

import type { SegnaviaControl } from './control.ts'
import { DeckController, type DeckState } from './controller.ts'
import type { SegnaviaFullscreen } from './controls.ts'
import { ICONS } from './controls-style.ts'
import { ENGLISH_LABELS, type PlayerLabels } from './labels.ts'
import { PLAYER_CSS } from './player-style.ts'
import type { SegnaviaStage } from './stage.ts'

const LAYOUT = `<div class="player" part="player">
  <div class="body"><div class="screen"><segnavia-stage part="stage"></segnavia-stage></div><segnavia-notes part="notes"></segnavia-notes></div>
  <segnavia-caption part="caption"></segnavia-caption>
  <div class="bar" part="bar">
    <segnavia-play></segnavia-play><segnavia-step to="previous"></segnavia-step><segnavia-step to="next"></segnavia-step>
    <segnavia-track></segnavia-track><segnavia-counter></segnavia-counter>
    <button class="notes-toggle" data-act="notes" hidden>${ICONS.notes}</button><segnavia-fullscreen></segnavia-fullscreen>
  </div></div>`

const COMPONENTS = 'segnavia-play,segnavia-step,segnavia-track,segnavia-counter,segnavia-fullscreen,segnavia-caption,segnavia-notes'

export class SegnaviaPlayer extends HTMLElement {
  static observedAttributes = ['src', 'notes']
  readonly controller: DeckController
  private root = this.attachShadow({ mode: 'open' })
  private stage: SegnaviaStage
  private words: PlayerLabels = ENGLISH_LABELS

  constructor() {
    super()
    const hash = this.getAttribute('hash')
    this.controller = new DeckController({ hash: hash === 'off' ? null : (hash ?? 'slide-'), prefetch: this.hasAttribute('prefetch') })
    this.root.innerHTML = `<style>${PLAYER_CSS}</style>${LAYOUT}`
    this.stage = this.root.querySelector('segnavia-stage') as SegnaviaStage
    for (const control of this.controls()) control.controller = this.controller
    ;(this.root.querySelector('segnavia-fullscreen') as SegnaviaFullscreen).targetElement = this
    this.controller.addEventListener('change', (event) => this.update((event as CustomEvent<DeckState>).detail))
    this.controller.addEventListener('exit', () => {
      if (document.fullscreenElement === this) void document.exitFullscreen()
    })
    this.root.addEventListener('keydown', this.onKey as EventListener)
    this.root.querySelector('.notes-toggle')?.addEventListener('click', () => this.toggleAttribute('notes'))
  }

  get labels(): PlayerLabels {
    return this.words
  }

  // Labels are the host's to translate; every component takes them.
  set labels(labels: PlayerLabels) {
    this.words = labels
    for (const control of this.controls()) control.labels = labels
    if (this.controller.state.deck) this.update(this.controller.state)
  }

  set resolveSlide(resolve: DeckController['resolveSlide']) {
    this.controller.resolveSlide = resolve
  }

  set css(css: string) {
    this.stage.css = css
  }

  connectedCallback() {
    if (!this.stage.controller) this.stage.controller = this.controller
  }

  attributeChangedCallback(name: string, _: string | null, value: string | null) {
    if (name === 'src' && value) void this.controller.loadUrl(value)
    if (name === 'notes' && this.controller.state.deck) this.update(this.controller.state)
  }

  private controls(): SegnaviaControl[] {
    return [...this.root.querySelectorAll<SegnaviaControl>(COMPONENTS)]
  }

  private update(state: DeckState) {
    const deck = state.deck
    if (!deck) return
    const player = this.root.querySelector('.player') as HTMLElement
    const open = this.hasAttribute('notes')
    player.dir = state.direction
    player.lang = deck.lang ?? ''
    player.setAttribute('aria-label', this.words.player)
    player.classList.toggle('notes-closed', !open)
    player.classList.toggle('silent', !deck.slides.some((slide) => slide.narration))
    this.setAttribute('role', 'region')
    ;(this.root.querySelector('.screen') as HTMLElement).style.setProperty('--ratio', String(deck.size.width / deck.size.height))
    const toggle = this.root.querySelector('.notes-toggle') as HTMLElement
    toggle.hidden = !deck.slides.some((slide) => slide.notes)
    toggle.setAttribute('aria-label', open ? this.words.hideNotes : this.words.showNotes)
    toggle.setAttribute('aria-pressed', String(open))
    this.dataset.slide = String(state.index + 1)
    this.dataset.playing = String(state.playing)
    this.dataset.word = state.word === null ? '' : String(state.word)
    this.dataset.shown = state.shown === null ? 'all' : state.shown.join(',')
    this.dataset.direction = state.direction
  }

  // The stage handles keys pressed on it. Elsewhere in the player, paging keys
  // still page, but Space and Enter keep their meaning on a focused button.
  private onKey = (event: KeyboardEvent) => {
    const target = event.composedPath()[0]
    if (target === this.stage) return
    if ((event.key === ' ' || event.key === 'Enter') && target instanceof HTMLButtonElement) return
    if (this.controller.key(event.key)) event.preventDefault()
  }
}
