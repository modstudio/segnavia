// <segnavia-player>: the finished player, a layout of the styled components
// around a stage, for a host that wants to use the library as it is. A host
// that wants only some of it places the components itself; a host that wants
// none of it uses the headless stage and controller.
//
// Attributes: src, theme, notes, hash, prefetch, transition,
// transition-duration, playback, captions, presentation and fit. Properties:
// controller, resolveSlide, css, cspExtra, labels and transition. The actions
// and below slots add host chrome. Parts expose the player, stage, notes,
// caption, bar, controls, track segments and caption words. Data attributes
// mirror the state for styling: data-slide, data-playing, data-word,
// data-shown and data-direction.

import type { TransitionInput } from '@segnavia/format'
import type { SegnaviaControl } from './control.ts'
import { deckHasNarration } from './control-values.ts'
import { type ControllerOptions, DeckController, type DeckState } from './controller.ts'
import { resumeController, suspendController } from './controller-connection.ts'
import type { SegnaviaFullscreen } from './controls.ts'
import { forwardedIconSlot, iconSlot } from './icon-slots.ts'
import { isEditableLetterShortcut } from './keys.ts'
import { ENGLISH_LABELS, type PlayerLabels, playerLabels } from './labels.ts'
import { handlePlayerKey } from './player-key.ts'
import { PLAYER_CSS } from './player-style.ts'
import type { SegnaviaRail } from './rail.ts'
import type { SegnaviaStage } from './stage.ts'
import { STYLED_ELEMENTS } from './styled-elements.ts'
import type { HostTransition } from './transition.ts'

const LAYOUT = `<div class="player" part="player">
  <div class="body"><div class="screen"><segnavia-stage part="stage"></segnavia-stage></div><segnavia-notes part="notes"></segnavia-notes></div>
  <segnavia-caption part="caption" exportparts="caption,word,word-spoken,word-current"></segnavia-caption>
  <div class="bar" part="bar">
    <segnavia-track exportparts="track,segment"></segnavia-track>
    <div class="control-row">
      <div class="start"><segnavia-counter exportparts="count:counter"></segnavia-counter><span class="time-separator">·</span><segnavia-time exportparts="time"></segnavia-time></div>
      <div class="center"><segnavia-step to="previous" exportparts="step-button,button:previous-button">${forwardedIconSlot('previous')}</segnavia-step><segnavia-play exportparts="button:play-button">${forwardedIconSlot('play')}${forwardedIconSlot('pause')}</segnavia-play><segnavia-step to="next" exportparts="step-button,button:next-button">${forwardedIconSlot('next')}</segnavia-step></div>
      <div class="end"><slot name="actions"></slot><segnavia-mute exportparts="button:mute-button">${forwardedIconSlot('mute')}${forwardedIconSlot('unmute')}</segnavia-mute><segnavia-captions exportparts="button:captions-button">${forwardedIconSlot('captionsOn')}${forwardedIconSlot('captionsOff')}</segnavia-captions><button class="notes-toggle" part="notes-button" data-act="notes" hidden>${iconSlot('notes')}</button><segnavia-fullscreen exportparts="button:presentation-button">${forwardedIconSlot('enterPresentation')}${forwardedIconSlot('exitPresentation')}</segnavia-fullscreen></div>
    </div>
  </div><segnavia-rail exportparts="rail,thumbnail,thumbnail-current,thumbnail-number"></segnavia-rail><div class="below"><slot name="below"></slot></div></div>`

const COMPONENTS = Object.values(STYLED_ELEMENTS)
  .filter((tag) => tag !== STYLED_ELEMENTS.player)
  .join(',')

function playerOptions(player: HTMLElement): Pick<ControllerOptions, 'playback' | 'captions'> {
  const playback = player.getAttribute('playback')
  const captions = player.getAttribute('captions')
  return {
    playback: playback === 'continuous' || playback === 'step' ? playback : undefined,
    captions: captions === 'on' || captions === 'off' || captions === 'viewer' ? captions : undefined,
  }
}

function playerPresentation(player: HTMLElement): 'window' | 'native' | 'off' {
  const presentation = player.getAttribute('presentation')
  return presentation === 'native' || presentation === 'off' ? presentation : 'window'
}

export class SegnaviaPlayer extends HTMLElement {
  static observedAttributes = ['src', 'notes', 'rail', 'transition', 'transition-duration', 'presentation', 'playback', 'captions']
  readonly controller: DeckController
  private root = this.attachShadow({ mode: 'open' })
  private stage: SegnaviaStage
  private words: PlayerLabels = ENGLISH_LABELS

  constructor() {
    super()
    const hash = this.getAttribute('hash')
    this.controller = new DeckController({
      hash: hash === 'off' ? null : (hash ?? 'slide-'),
      prefetch: this.hasAttribute('prefetch'),
    })
    this.root.innerHTML = `<style>${PLAYER_CSS}</style>${LAYOUT}`
    this.stage = this.root.querySelector('segnavia-stage') as SegnaviaStage
    for (const control of this.controls()) if (control.tagName !== 'SEGNAVIA-RAIL' || this.rail) control.controller = this.controller
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
  set labels(labels: Partial<PlayerLabels>) {
    this.words = playerLabels(labels)
    this.stage.frameTitle = this.words.frameTitle
    for (const control of this.controls()) control.labels = this.words
    if (this.controller.state.deck) this.update(this.controller.state)
    this.dispatchEvent(new CustomEvent('segnavia-labels'))
  }

  set resolveSlide(resolve: DeckController['resolveSlide']) {
    this.controller.resolveSlide = resolve
  }

  set css(css: string) {
    this.stage.css = css
  }

  set cspExtra(csp: string) {
    this.stage.cspExtra = csp
  }

  get rail(): boolean {
    return this.hasAttribute('rail')
  }

  set rail(value: boolean) {
    this.toggleAttribute('rail', value)
  }

  get transition(): HostTransition | undefined {
    return this.stage.transition
  }

  set transition(value: TransitionInput | 'none') {
    this.stage.transition = value
  }

  authoringMount(): HTMLElement {
    return this.root.querySelector('.below') as HTMLElement
  }

  authoringRail(): SegnaviaRail {
    return this.root.querySelector('segnavia-rail') as SegnaviaRail
  }

  setAuthoringScriptsRefused(refused: boolean) {
    this.stage.setAuthoringScriptsRefused(refused)
  }

  connectedCallback() {
    resumeController(this.controller)
    this.stage.frameTitle = this.words.frameTitle
    if (!this.stage.controller) this.stage.controller = this.controller
    this.passTransitionAttributes()
    void this.configurePresentation()
  }

  disconnectedCallback() {
    suspendController(this.controller)
  }

  attributeChangedCallback(name: string, _: string | null, value: string | null) {
    if (name === 'src' && value) {
      this.passPlayerOptions()
      void this.controller.loadUrl(value)
    }
    if (name === 'playback' || name === 'captions') this.passPlayerOptions()
    if (name === 'notes' && this.controller.state.deck) this.update(this.controller.state)
    if (name === 'rail') this.configureRail()
    if (name === 'transition' || name === 'transition-duration') this.passTransitionAttributes()
    if (name === 'presentation') void this.configurePresentation()
  }

  private passPlayerOptions() {
    this.controller.setPlayerOptions(playerOptions(this))
  }

  private passTransitionAttributes() {
    for (const name of ['transition', 'transition-duration']) {
      const value = this.getAttribute(name)
      if (value === null) this.stage.removeAttribute(name)
      else this.stage.setAttribute(name, value)
    }
  }

  private controls(): SegnaviaControl[] {
    return [...this.root.querySelectorAll<SegnaviaControl>(COMPONENTS)]
  }

  private configureRail() {
    const rail = this.root.querySelector('segnavia-rail') as SegnaviaRail
    rail.controller = this.rail ? this.controller : null
    if (!this.rail) rail.clearItems()
    else rail.refresh()
  }

  private async configurePresentation() {
    const presentation = playerPresentation(this)
    const control = this.root.querySelector('segnavia-fullscreen') as SegnaviaFullscreen
    if (presentation !== 'window' && this.controller.state.presenting) this.controller.stopPresenting()
    if (presentation !== 'native' && document.fullscreenElement === this) await document.exitFullscreen()
    control.hidden = presentation === 'off'
    control.setAttribute('mode', presentation === 'native' ? 'native' : 'window')
  }

  private togglePresentation() {
    if (playerPresentation(this) === 'off') return
    ;(this.root.querySelector('segnavia-fullscreen') as SegnaviaFullscreen).toggle()
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
    player.classList.toggle('silent', !deckHasNarration(state))
    this.setAttribute('role', 'region')
    ;(this.root.querySelector('.screen') as HTMLElement).style.setProperty('--ratio', String(deck.size.width / deck.size.height))
    const toggle = this.root.querySelector('.notes-toggle') as HTMLElement
    toggle.hidden = !deck.slides.some((slide) => slide.notes)
    toggle.setAttribute('aria-label', open ? this.words.hideNotes : this.words.showNotes)
    toggle.setAttribute('aria-pressed', String(open))
    const time = this.root.querySelector('segnavia-time') as HTMLElement
    ;(this.root.querySelector('.time-separator') as HTMLElement).hidden = time.hidden
    this.dataset.slide = String(state.index + 1)
    this.dataset.playing = String(state.playing)
    this.dataset.word = state.word === null ? '' : String(state.word)
    this.dataset.shown = state.shown === null ? 'all' : state.shown.join(',')
    this.dataset.direction = state.direction
  }

  // The stage handles keys pressed on it. Elsewhere in the player, paging keys
  // still page, but Space and Enter keep their meaning on a focused button.
  private onKey = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === 'f' && !isEditableLetterShortcut(event.key, event.composedPath()[0])) {
      if (playerPresentation(this) === 'off') return
      if (this.controller.key(event.key) === 'present') {
        event.preventDefault()
        this.togglePresentation()
      }
      return
    }
    handlePlayerKey(this.controller, this.stage, event)
  }
}
