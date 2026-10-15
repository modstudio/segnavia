// The styled controls: play, step, counter, full screen and the slide track.
// Each is one finished piece a host can place anywhere, alone or beside its
// own controls; the player is a layout of them.
//
//   <segnavia-play for="stage">             play and pause
//   <segnavia-step to="next" for="stage">   previous or next, mirrored in right to left
//   <segnavia-counter for="stage">          "3 / 4", left to right in any direction
//   <segnavia-fullscreen target="box">      full screen for the element named, or the stage
//   <segnavia-track for="stage">            one segment per slide, filling as narration runs

import { SegnaviaControl } from './control.ts'
import { deckHasNarration, formatTime } from './control-values.ts'
import type { DeckState } from './controller.ts'
import { BUTTON_CSS, ICONS, TOKENS_CSS } from './controls-style.ts'
import { deckTimeline, slideDurationMs } from './timeline.ts'
import { trackMsAt } from './track-mapping.ts'

export class SegnaviaTime extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}:host{display:inline-block;font-variant-numeric:tabular-nums;color:var(--_muted);font-size:13px;white-space:nowrap}`
  }
  protected markup() {
    return '<span part="time" dir="ltr" aria-live="polite"></span>'
  }
  protected render(state: DeckState) {
    const duration = state.slide ? slideDurationMs(state.slide) : null
    const elapsed = state.playback === 'continuous' ? state.elapsedMs : state.slideElapsedMs
    const total = state.playback === 'continuous' ? state.totalMs : duration
    ;(this.root.querySelector('span') as HTMLElement).textContent =
      total === null || total === 0 ? '' : this.labels.time(formatTime(elapsed), formatTime(total))
  }
}

export class SegnaviaMute extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}`
  }
  protected markup() {
    return '<button part="button"></button>'
  }
  protected render(state: DeckState) {
    this.hidden = !deckHasNarration(state)
    const button = this.root.querySelector('button') as HTMLButtonElement
    button.innerHTML = state.muted ? ICONS.muted : ICONS.volume
    button.setAttribute('aria-label', state.muted ? this.labels.unmute : this.labels.mute)
    button.setAttribute('aria-pressed', String(state.muted))
  }
  protected clicked() {
    if (this.controller) this.controller.setMuted(!this.controller.state.muted)
  }
}

export class SegnaviaCaptions extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}`
  }
  protected markup() {
    return '<button part="button"></button>'
  }
  protected render(state: DeckState) {
    this.hidden = !deckHasNarration(state) || this.controller?.captionsPolicy !== 'viewer'
    const button = this.root.querySelector('button') as HTMLButtonElement
    button.innerHTML = ICONS.captions
    button.setAttribute('aria-label', state.captionsVisible ? this.labels.hideCaptions : this.labels.showCaptions)
    button.setAttribute('aria-pressed', String(state.captionsVisible))
  }
  protected clicked() {
    if (this.controller) this.controller.setCaptionsVisible(!this.controller.state.captionsVisible)
  }
}

export class SegnaviaPlay extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}button{inline-size:40px;block-size:40px;border-radius:50%;background:var(--_accent);color:var(--_accent-ink)}
      button:hover{background:color-mix(in srgb,var(--_accent) 85%,var(--_ink))}`
  }
  protected markup() {
    return '<button part="button"></button>'
  }
  protected render(state: DeckState) {
    const button = this.root.querySelector('button') as HTMLButtonElement
    button.innerHTML = state.playing ? ICONS.pause : ICONS.play
    button.setAttribute('aria-label', state.playing ? this.labels.pause : this.labels.play)
  }
  protected clicked() {
    void this.controller?.toggle()
  }
}

export class SegnaviaStep extends SegnaviaControl {
  private get forward() {
    return this.getAttribute('to') !== 'previous'
  }
  protected styles() {
    return `${TOKENS_CSS}${BUTTON_CSS}`
  }
  protected markup() {
    return '<span part="wrapper"><button part="button"></button></span>'
  }
  // The icon follows the deck's reading direction, which may differ from the
  // page the control sits on.
  protected render(state: DeckState) {
    const wrapper = this.root.querySelector('span') as HTMLElement
    wrapper.dir = state.direction
    const button = this.root.querySelector('button') as HTMLButtonElement
    button.innerHTML = this.forward ? ICONS.next : ICONS.previous
    button.setAttribute('aria-label', this.forward ? this.labels.next : this.labels.previous)
    const total = state.deck?.slides.length ?? 0
    button.disabled = this.forward ? state.index >= total - 1 : state.index === 0
  }
  protected clicked() {
    void (this.forward ? this.controller?.next() : this.controller?.previous())?.catch(() => {})
  }
}

export class SegnaviaCounter extends SegnaviaControl {
  protected styles() {
    return `${TOKENS_CSS}:host{display:inline-block;font-variant-numeric:tabular-nums;color:var(--_muted);font-size:13px;white-space:nowrap}`
  }
  // A neutral slash between digits reorders in a right to left context, so the
  // count is isolated left to right.
  protected markup() {
    return '<span part="count" dir="ltr" aria-live="polite"></span>'
  }
  protected render(state: DeckState) {
    ;(this.root.querySelector('span') as HTMLElement).textContent = `${state.index + 1} / ${state.deck?.slides.length ?? 0}`
  }
}

export class SegnaviaFullscreen extends SegnaviaControl {
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
  targetElement: Element | null = null
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
    return '<button part="button"></button>'
  }
  protected render(_state: DeckState) {
    const full =
      this.getAttribute('mode') === 'window' ? _state.presenting : document.fullscreenElement !== null && document.fullscreenElement === this.target()
    const button = this.root.querySelector('button') as HTMLButtonElement
    button.innerHTML = full ? ICONS.exitFullscreen : ICONS.enterFullscreen
    button.setAttribute('aria-label', full ? this.labels.exitFullscreen : this.labels.enterFullscreen)
  }
  protected clicked() {
    const target = this.target()
    if (!target) return
    if (this.getAttribute('mode') === 'window') {
      if (this.controller?.state.presenting) this.controller.stopPresenting()
      else if (target instanceof HTMLElement) this.controller?.present(target)
      return
    }
    void (document.fullscreenElement === target ? document.exitFullscreen() : target.requestFullscreen())
  }

  private onFullscreen = () => this.controller && this.render(this.controller.state)
}

export class SegnaviaTrack extends SegnaviaControl {
  private count = -1
  private mode: DeckState['playback'] | null = null
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
      ol{display:flex;gap:4px;margin:0;padding:0;list-style:none}li{flex:1;display:flex}
      button{all:unset;box-sizing:border-box;inline-size:100%;block-size:20px;border-radius:4px;position:relative;cursor:pointer}
      button:focus-visible{outline:2px solid var(--_accent);outline-offset:1px}
      button::before{content:"";position:absolute;inset-inline:0;inset-block:8px;border-radius:2px;background:var(--_line)}
      button:hover::before{background:var(--_muted)}
      .fill{position:absolute;inset-block:8px;inset-inline-start:0;inline-size:0;border-radius:2px;background:var(--_accent)}
      [data-state="done"] .fill{inline-size:100%;background:var(--_muted)}
      [data-state="current"] .fill{inline-size:calc(var(--progress,1) * 100%)}
      ol.continuous{gap:0;cursor:pointer;touch-action:none}
      ol.continuous li{flex:none;position:relative;block-size:20px}
      ol.continuous li.timed{flex-grow:var(--duration)}
      ol.continuous li.marker{inline-size:6px}
      ol.continuous .segment{position:absolute;inset:8px 0;background:var(--_line)}
      ol.continuous .fill{inset:0;block-size:auto}
      ol.continuous:focus-visible{outline:2px solid var(--_accent);outline-offset:1px}
      @media (prefers-reduced-motion:no-preference){.fill{transition:inline-size .12s linear}}`
  }
  protected markup() {
    return '<ol part="track"></ol>'
  }
  protected render(state: DeckState) {
    const list = this.root.querySelector('ol') as HTMLOListElement
    const slides = state.deck?.slides ?? []
    list.dir = state.direction
    const continuous = state.playback === 'continuous'
    list.classList.toggle('continuous', continuous)
    this.configureAccessibility(list, state, continuous)
    if (this.count !== slides.length || this.mode !== state.playback) {
      this.count = slides.length
      this.mode = state.playback
      list.innerHTML = continuous ? this.continuousSegments(slides) : this.stepSegments(slides)
    }
    this.renderSegments(list, state, continuous)
  }

  private configureAccessibility(list: HTMLOListElement, state: DeckState, continuous: boolean) {
    list.setAttribute('aria-label', continuous ? this.labels.seek : this.labels.slides)
    list.setAttribute('role', continuous ? 'slider' : 'list')
    list.tabIndex = continuous ? 0 : -1
    if (!continuous) {
      for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext']) list.removeAttribute(name)
      return
    }
    list.setAttribute('aria-valuemin', '0')
    list.setAttribute('aria-valuemax', String(state.totalMs))
    list.setAttribute('aria-valuenow', String(state.elapsedMs))
    list.setAttribute('aria-valuetext', this.labels.time(formatTime(state.elapsedMs), formatTime(state.totalMs)))
  }

  private continuousSegments(slides: NonNullable<DeckState['deck']>['slides']): string {
    return slides
      .map((slide, index) => {
        const duration = slideDurationMs(slide)
        return `<li class="${duration === null ? 'marker' : 'timed'}" data-go="${index}" style="--duration:${duration ?? 0}"><span class="segment" part="segment"><span class="fill"></span></span></li>`
      })
      .join('')
  }

  private stepSegments(slides: NonNullable<DeckState['deck']>['slides']): string {
    return slides
      .map(
        (slide, index) =>
          `<li><button part="segment" data-go="${index}"${slideDurationMs(slide) !== null ? ' data-plays' : ''}><span class="fill"></span></button></li>`,
      )
      .join('')
  }

  private renderSegments(list: HTMLOListElement, state: DeckState, continuous: boolean) {
    const slides = state.deck?.slides ?? []
    for (const item of list.querySelectorAll<HTMLElement>('[data-go]')) {
      const index = Number(item.dataset.go)
      const segment = (continuous ? item.querySelector('.segment') : item) as HTMLElement
      segment.dataset.state = index < state.index ? 'done' : index === state.index ? 'current' : 'upcoming'
      segment.style.setProperty('--progress', continuous ? String(state.progress) : state.playing ? String(state.progress) : '1')
      if (!continuous) {
        segment.setAttribute('aria-label', this.labels.slide(index + 1, slides.length))
        if (index === state.index) segment.setAttribute('aria-current', 'step')
        else segment.removeAttribute('aria-current')
      }
    }
  }
  protected clicked(event: Event) {
    if (this.controller?.state.playback === 'continuous') return
    const go = (event.target as Element).closest('button')?.dataset.go
    if (go !== undefined) void this.controller?.go(Number(go))?.catch(() => {})
  }

  private onPointer = (event: PointerEvent) => {
    if (this.controller?.state.playback !== 'continuous' || (event.type === 'pointermove' && !this.dragging)) return
    this.dragging = event.type === 'pointerdown' || this.dragging
    if (event.type === 'pointerdown') (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    const list = event.currentTarget as HTMLElement
    const rect = list.getBoundingClientRect()
    const timeline = deckTimeline(this.controller.state.deck as NonNullable<DeckState['deck']>)
    void this.controller.seek(trackMsAt(event.clientX - rect.left, rect.width, timeline, this.controller.state.direction))
  }

  private onKey = (event: KeyboardEvent) => {
    const controller = this.controller
    if (controller?.state.playback !== 'continuous') return
    const state = controller.state
    const timeline = deckTimeline(state.deck as NonNullable<DeckState['deck']>)
    let target: number | null = null
    if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = state.totalMs
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const forward = event.key === 'ArrowRight' ? state.direction === 'ltr' : state.direction === 'rtl'
      target = state.elapsedMs + (forward ? 5000 : -5000)
    } else if (event.key === 'PageUp') target = timeline.slides[Math.max(0, state.index - 1)]?.startMs ?? 0
    else if (event.key === 'PageDown') target = timeline.slides[Math.min(timeline.slides.length - 1, state.index + 1)]?.startMs ?? state.totalMs
    if (target === null) return
    event.preventDefault()
    void controller.seek(Math.max(0, Math.min(state.totalMs, target)))
  }
}
