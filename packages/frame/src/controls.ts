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
import type { DeckState } from './controller.ts'
import { BUTTON_CSS, ICONS, TOKENS_CSS } from './controls-style.ts'

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
  constructor() {
    super()
    document.addEventListener('fullscreenchange', () => this.controller && this.render(this.controller.state))
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
    const full = document.fullscreenElement !== null && document.fullscreenElement === this.target()
    const button = this.root.querySelector('button') as HTMLButtonElement
    button.innerHTML = full ? ICONS.exitFullscreen : ICONS.enterFullscreen
    button.setAttribute('aria-label', full ? this.labels.exitFullscreen : this.labels.enterFullscreen)
  }
  protected clicked() {
    const target = this.target()
    if (!target) return
    void (document.fullscreenElement === target ? document.exitFullscreen() : target.requestFullscreen())
  }
}

export class SegnaviaTrack extends SegnaviaControl {
  private count = -1
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
      @media (prefers-reduced-motion:no-preference){.fill{transition:inline-size .12s linear}}`
  }
  protected markup() {
    return '<ol part="track"></ol>'
  }
  protected render(state: DeckState) {
    const list = this.root.querySelector('ol') as HTMLOListElement
    const slides = state.deck?.slides ?? []
    list.dir = state.direction
    list.setAttribute('aria-label', this.labels.slides)
    if (this.count !== slides.length) {
      this.count = slides.length
      list.innerHTML = slides
        .map((slide, index) => `<li><button part="segment" data-go="${index}"${slide.narration ? ' data-plays' : ''}><span class="fill"></span></button></li>`)
        .join('')
    }
    for (const segment of list.querySelectorAll<HTMLElement>('button')) {
      const index = Number(segment.dataset.go)
      segment.dataset.state = index < state.index ? 'done' : index === state.index ? 'current' : 'upcoming'
      segment.style.setProperty('--progress', state.playing ? String(state.progress) : '1')
      segment.setAttribute('aria-label', this.labels.slide(index + 1, slides.length))
      if (index === state.index) segment.setAttribute('aria-current', 'step')
      else segment.removeAttribute('aria-current')
    }
  }
  protected clicked(event: Event) {
    const go = (event.target as Element).closest('button')?.dataset.go
    if (go !== undefined) void this.controller?.go(Number(go))?.catch(() => {})
  }
}
