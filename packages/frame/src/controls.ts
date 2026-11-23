// The styled controls: play, step, counter, time, mute, captions, caption,
// notes, presentation and the slide track. Each is one finished piece a host
// can place anywhere, alone or beside its own controls; the player is a layout
// of them.
//
//   <segnavia-play for="stage">             play and pause
//   <segnavia-step to="next" for="stage">   previous or next, mirrored in right to left
//   <segnavia-counter for="stage">          "3 / 4", left to right in any direction
//   <segnavia-time for="stage">             elapsed and total time
//   <segnavia-mute for="stage">             mute narration
//   <segnavia-captions for="stage">         show or hide viewer captions
//   <segnavia-caption for="stage">          narration text and current word
//   <segnavia-notes for="stage">            notes for the current slide
//   <segnavia-fullscreen target="box">      window presentation by default, native with mode="native"
//   <segnavia-track for="stage">            one segment per slide, filling as narration runs

import { SegnaviaControl, SegnaviaDeckControl } from './control.ts'
import { captionsControlVisible, formatTime, stepForwardDisabled, trackSegmentState } from './control-values.ts'
import type { DeckState } from './controller.ts'
import { BUTTON_CSS, READOUT_CSS, TOKENS_CSS } from './controls-style.ts'
import { deckFolioAt, deckFolios } from './deck-folios.ts'
import { type IconName, iconSlot, iconSlotName } from './icon-slots.ts'
import type { PlaybackState } from './playback.ts'
import { playbackKeyTarget } from './playback-key.ts'
import { stepTrackKeyTarget } from './step-track-key.ts'
import { stepTrackSliderValues } from './step-track-values.ts'
import { type DeckTimeline, slideDurationMs } from './timeline.ts'
import { TRACK_GAP_WIDTH, TRACK_MARKER_WIDTH, trackTargetAt } from './track-mapping.ts'

const icon = (root: ShadowRoot, name: IconName) => root.querySelector(`[name="${iconSlotName(name)}"]`) as HTMLSlotElement

export class SegnaviaTime extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}${READOUT_CSS}`
  }
  protected markup() {
    return '<span part="time" dir="ltr" aria-live="polite"></span>'
  }
  protected render(state: PlaybackState) {
    const values = state.playable ? { elapsedMs: state.elapsedMs, totalMs: state.totalMs } : null
    this.hidden = values === null
    ;(this.root.querySelector('span') as HTMLElement).textContent = values ? this.labels.time(formatTime(values.elapsedMs), formatTime(values.totalMs)) : ''
  }
}

export class SegnaviaMute extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}`
  }
  protected markup() {
    return `<button part="button">${iconSlot('mute')}${iconSlot('unmute')}</button>`
  }
  protected render(state: PlaybackState) {
    this.hidden = !state.audible
    const button = this.root.querySelector('button') as HTMLButtonElement
    icon(this.root, 'mute').hidden = state.muted
    icon(this.root, 'unmute').hidden = !state.muted
    button.setAttribute('aria-label', state.muted ? this.labels.unmute : this.labels.mute)
    button.setAttribute('aria-pressed', String(state.muted))
  }
  protected clicked() {
    if (this.playback) this.playback.setMuted(!this.playback.state.muted)
  }
}

export class SegnaviaCaptions extends SegnaviaDeckControl {
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}`
  }
  protected markup() {
    return `<button part="button">${iconSlot('captionsOn')}${iconSlot('captionsOff')}</button>`
  }
  protected renderDeck(state: DeckState) {
    this.hidden = !captionsControlVisible(state, this.deckController?.captionsPolicy ?? 'viewer')
    const button = this.root.querySelector('button') as HTMLButtonElement
    icon(this.root, 'captionsOn').hidden = !state.captionsVisible
    icon(this.root, 'captionsOff').hidden = state.captionsVisible
    button.setAttribute('aria-label', state.captionsVisible ? this.labels.hideCaptions : this.labels.showCaptions)
    button.setAttribute('aria-pressed', String(state.captionsVisible))
  }
  protected clicked() {
    if (this.deckController) this.deckController.setCaptionsVisible(!this.deckController.state.captionsVisible)
  }
}

export class SegnaviaPlay extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}button{inline-size:var(--_play-size);block-size:var(--_play-size);border-radius:50%;background:var(--_accent);color:var(--_accent-ink)}
      button:hover{background:color-mix(in srgb,var(--_accent) 85%,var(--_ink))}`
  }
  protected markup() {
    return `<button part="button">${iconSlot('play')}${iconSlot('pause')}</button>`
  }
  protected render(state: PlaybackState) {
    this.hidden = !state.playable
    const button = this.root.querySelector('button') as HTMLButtonElement
    icon(this.root, 'play').hidden = state.playing
    icon(this.root, 'pause').hidden = !state.playing
    button.setAttribute('aria-label', state.playing ? this.labels.pause : this.labels.play)
  }
  protected clicked() {
    void this.playback?.toggle()?.catch(() => {})
  }
}

export class SegnaviaStep extends SegnaviaDeckControl {
  private get forward() {
    return this.getAttribute('to') !== 'previous'
  }
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}`
  }
  protected markup() {
    return `<span part="wrapper"><button part="button step-button">${iconSlot('previous')}${iconSlot('next')}</button></span>`
  }
  // The icon follows the deck's reading direction, which may differ from the
  // page the control sits on.
  protected renderDeck(state: DeckState) {
    const wrapper = this.root.querySelector('span') as HTMLElement
    wrapper.dir = state.direction
    const button = this.root.querySelector('button') as HTMLButtonElement
    icon(this.root, 'previous').hidden = this.forward
    icon(this.root, 'next').hidden = !this.forward
    button.setAttribute('aria-label', this.forward ? this.labels.next : this.labels.previous)
    button.disabled = this.forward ? stepForwardDisabled(state) : state.index === 0
  }
  protected clicked() {
    void (this.forward ? this.deckController?.next() : this.deckController?.previous())?.catch(() => {})
  }
}

export class SegnaviaCounter extends SegnaviaDeckControl {
  protected styles() {
    return `${TOKENS_CSS}${READOUT_CSS}`
  }
  // A neutral slash between digits reorders in a right to left context, so the
  // count is isolated left to right.
  protected markup() {
    return '<span part="count" dir="ltr" aria-live="polite"></span>'
  }
  protected renderDeck(state: DeckState) {
    const folios = deckFolios(state.deck)
    const current = deckFolioAt(folios, state.index)
    const total = deckFolioAt(folios, folios.length - 1).text
    ;(this.root.querySelector('span') as HTMLElement).textContent = `${current.text} / ${total}`
  }
}

export class SegnaviaFullscreen extends SegnaviaDeckControl {
  private explicitTarget: Element | null = null

  connectedCallback() {
    super.connectedCallback()
    document.addEventListener('fullscreenchange', this.onFullscreen)
  }
  disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('fullscreenchange', this.onFullscreen)
  }
  // An element set directly wins over the `target` id, for a host whose
  // target is outside the component's own root.
  get targetElement(): Element | null {
    return this.explicitTarget
  }

  set targetElement(value: Element | null) {
    this.explicitTarget = value
  }
  private target(): Element | null {
    if (this.targetElement) return this.targetElement
    const id = this.getAttribute('target') ?? this.getAttribute('for')
    const root = this.getRootNode() as Document | ShadowRoot
    return id ? root.getElementById(id) : null
  }
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}`
  }
  protected markup() {
    return `<button part="button">${iconSlot('enterPresentation')}${iconSlot('exitPresentation')}</button>`
  }
  protected renderDeck(_state: DeckState) {
    const windowMode = this.getAttribute('mode') !== 'native'
    const full = windowMode ? _state.presenting : document.fullscreenElement !== null && document.fullscreenElement === this.target()
    const button = this.root.querySelector('button') as HTMLButtonElement
    icon(this.root, 'enterPresentation').hidden = full
    icon(this.root, 'exitPresentation').hidden = !full
    button.setAttribute(
      'aria-label',
      windowMode ? (full ? this.labels.exitPresentation : this.labels.enterPresentation) : full ? this.labels.exitFullscreen : this.labels.enterFullscreen,
    )
  }
  protected clicked() {
    this.toggle()
  }
  toggle() {
    const target = this.target()
    if (!target) return
    if (this.getAttribute('mode') !== 'native') {
      if (this.deckController?.state.presenting) this.deckController.stopPresenting()
      else if (target instanceof HTMLElement) this.deckController?.present(target)
      return
    }
    void (document.fullscreenElement === target ? document.exitFullscreen() : target.requestFullscreen())
  }

  private onFullscreen = () => this.deckController && this.render(this.deckController.state)
}

export class SegnaviaTrack extends SegnaviaControl {
  private count = -1
  private mode: DeckState['playback'] | null = null
  private deck: DeckState['deck'] = null
  private timeline: DeckTimeline | null = null
  private dragging = false
  private listening = false
  connectedCallback() {
    super.connectedCallback()
    if (this.listening) return
    this.listening = true
    const list = this.root.querySelector('ol') as HTMLOListElement
    list.addEventListener('pointerdown', this.onPointer)
    list.addEventListener('pointermove', this.onPointer)
    list.addEventListener('pointerup', () => {
      this.dragging = false
    })
    list.addEventListener('keydown', this.onKey)
  }
  protected styles() {
    return `${TOKENS_CSS}:host{display:block;min-inline-size:60px}
      ol{display:flex;gap:${TRACK_GAP_WIDTH}px;margin:0;padding:0;list-style:none;position:relative}li{flex:1;display:flex}
      ol::after{content:"";position:absolute;z-index:1;pointer-events:none;inset-block:0;inset-inline-start:calc(var(--_reach,1) * 100%);inset-inline-end:0;background:color-mix(in srgb,var(--_surface) 65%,transparent)}
      button{all:unset;box-sizing:border-box;inline-size:100%;block-size:20px;border-radius:var(--_radius-mark);position:relative;cursor:pointer}
      ol:focus-visible{outline:2px solid var(--_accent);outline-offset:1px}
      button::before{content:"";position:absolute;inset-inline:0;inset-block:8px;border-radius:var(--_radius-line);background:var(--_line)}
      button:hover::before{background:var(--_muted)}
      .fill{position:absolute;inset-block:8px;inset-inline-start:0;inline-size:0;border-radius:var(--_radius-line);background:var(--_accent)}
      [data-state="done"] .fill{inline-size:100%;background:var(--_muted)}
      [data-state="current"] .fill{inline-size:calc(var(--progress,1) * 100%)}
      [data-state="locked"]{opacity:.45}
      ol.continuous{cursor:pointer;touch-action:none}
      ol.continuous li{flex:none;position:relative;block-size:20px}
      ol.continuous li.timed{flex-grow:var(--duration)}
      ol.continuous li.marker{inline-size:${TRACK_MARKER_WIDTH}px}
      ol.continuous .segment{position:absolute;inset:8px 0;background:var(--_line)}
      ol.continuous .fill{inset:0;block-size:auto}
      @media (prefers-reduced-motion:no-preference){.fill{transition:inline-size .12s linear}}`
  }
  protected markup() {
    return '<ol part="track"></ol>'
  }
  protected render(state: PlaybackState) {
    const list = this.root.querySelector('ol') as HTMLOListElement
    const slides = state.deck?.slides ?? []
    list.dir = state.direction
    const continuous = state.playback === 'continuous'
    list.classList.toggle('continuous', continuous)
    list.style.setProperty('--_reach', String(state.reach))
    this.configureAccessibility(list, state, continuous)
    if (
      this.count !== slides.length ||
      this.mode !== state.playback ||
      this.deck !== (state.deck ?? null) ||
      (continuous && this.timeline !== state.timeline)
    ) {
      this.count = slides.length
      this.mode = state.playback
      this.deck = state.deck ?? null
      this.timeline = state.timeline
      list.innerHTML = continuous ? this.continuousSegments(state.timeline) : state.deck ? this.stepSegments(state.deck) : ''
    }
    this.renderSegments(list, state, continuous)
  }
  private configureAccessibility(list: HTMLOListElement, state: PlaybackState, continuous: boolean) {
    list.setAttribute('aria-label', continuous ? this.labels.seek : this.labels.slides)
    list.setAttribute('role', 'slider')
    list.tabIndex = 0
    if (!continuous) {
      const slides = state.deck?.slides ?? []
      const values = stepTrackSliderValues(state.index, slides.length, slides[state.index]?.title, this.labels.slide)
      for (const [name, value] of Object.entries(values)) list.setAttribute(name, value)
      return
    }
    list.setAttribute('aria-valuemin', '0')
    list.setAttribute('aria-valuemax', String(state.totalMs))
    list.setAttribute('aria-valuenow', String(state.elapsedMs))
    list.setAttribute('aria-valuetext', this.labels.time(formatTime(state.elapsedMs), formatTime(state.totalMs)))
  }

  private continuousSegments(timeline: DeckTimeline): string {
    return timeline.slides
      .map((segment, index) => {
        return `<li class="${segment.untimed ? 'marker' : 'timed'}" data-go="${index}" style="--duration:${segment.durationMs ?? 0}"><span class="segment" part="segment"><span class="fill"></span></span></li>`
      })
      .join('')
  }

  private stepSegments(deck: NonNullable<DeckState['deck']>): string {
    return deck.slides
      .map(
        (slide, index) =>
          `<li><button part="segment" data-go="${index}" tabindex="-1" aria-hidden="true"${slideDurationMs(slide, deck) !== null ? ' data-plays' : ''}><span class="fill"></span></button></li>`,
      )
      .join('')
  }

  private renderSegments(list: HTMLOListElement, state: PlaybackState, continuous: boolean) {
    if (continuous) {
      this.renderContinuousSegments(list, state)
      return
    }
    const deckState = this.deckController?.state
    if (!deckState?.deck) return
    for (const item of list.querySelectorAll<HTMLElement>('[data-go]')) {
      const index = Number(item.dataset.go)
      item.dataset.state = trackSegmentState(deckState, index, deckState.index)
      item.style.setProperty('--progress', deckState.playing ? String(deckState.progress) : '1')
    }
  }
  private renderContinuousSegments(list: HTMLOListElement, state: PlaybackState) {
    for (const item of list.querySelectorAll<HTMLElement>('[data-go]')) {
      const index = Number(item.dataset.go)
      const segment = item.querySelector<HTMLElement>('.segment')
      if (!segment) continue
      segment.dataset.state = index >= state.lockedFrom ? 'locked' : index < state.index ? 'done' : index === state.index ? 'current' : 'upcoming'
      segment.style.setProperty('--progress', String(state.progress))
    }
  }
  protected clicked(event: Event) {
    if (this.playback?.state.playback === 'continuous') return
    const go = (event.target as Element).closest('button')?.dataset.go
    if (go !== undefined) void this.deckController?.go(Number(go))?.catch(() => {})
  }

  private onPointer = (event: PointerEvent) => {
    const playback = this.playback
    if (playback?.state.playback !== 'continuous' || (event.type === 'pointermove' && !this.dragging)) return
    this.dragging = event.type === 'pointerdown' || this.dragging
    if (event.type === 'pointerdown') (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const list = event.currentTarget as HTMLElement
    const rect = list.getBoundingClientRect()
    const state = playback.state
    const target = trackTargetAt(event.clientX - rect.left, rect.width, state.timeline, state.direction)
    const action =
      target.localMs === null ? this.deckController?.go(target.index) : playback.seek((state.timeline.slides[target.index]?.startMs ?? 0) + target.localMs)
    if (!action) return
    void action.catch(() => {})
  }

  private onKey = (event: KeyboardEvent) => {
    const playback = this.playback
    if (!playback) return
    const state = playback.state
    if (state.playback !== 'continuous') {
      const controller = this.deckController
      const deckState = controller?.state
      if (!controller || !deckState?.deck) return
      const lastIndex = deckState.deck.slides.length - 1
      const furthestAllowed = deckState.seek === 'free' ? lastIndex : deckState.watched.reach.index
      const target = stepTrackKeyTarget(event.key, deckState.index, deckState.deck.slides.length, deckState.direction, furthestAllowed)
      if (target === null) return
      event.preventDefault()
      event.stopPropagation()
      void controller.go(target).catch(() => {})
      return
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      const controller = this.deckController
      const deckState = controller?.state
      if (!controller || !deckState?.deck) return
      const offset = event.key === 'PageUp' ? -1 : 1
      event.preventDefault()
      void controller.go(Math.max(0, Math.min(deckState.timeline.slides.length - 1, deckState.index + offset))).catch(() => {})
      return
    }
    const target = playbackKeyTarget(event.key, state)
    if (target === null) return
    event.preventDefault()
    void playback.seek(Math.max(0, Math.min(state.totalMs, target))).catch(() => {})
  }
}
