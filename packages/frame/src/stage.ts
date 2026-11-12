// <segnavia-stage>: shows the current slide of a DeckController, scaled to
// fit the box the host gives it, with a shot's annotations shown on cue. It
// draws no controls and brings no appearance: a host styles it, and builds
// its own controls from `stage.controller`.
// Give it a controller, or a deck: attributes src, hash ("off" to leave the
// address alone) and prefetch create one. `unstyled` drops even the geometry. Keys pressed on the stage, or inside
// a slide (through the bridge), go to the controller in reading direction.
// State is mirrored as data attributes for styling: data-slide, data-playing,
// data-word, data-shown, data-direction. A visible canvas has data-active, and
// a pending incoming canvas on any swap has data-incoming. Motion uses
// data-transition, data-entering, data-leaving, data-running and data-axis.

import type { OriginApproval, PreflightProfileInput, SlotsOptions, TransitionInput } from '@segnavia/format'
import { AsOfElement, captureAsOfLoad, dispatchAsof } from './as-of-element.ts'
import { ensureBaseStyle } from './base-style.ts'
import { animationMessage, dispatchFontFailures, MESSAGE, messageFrom, type PageSelection } from './bridge.ts'
import { DeckController, type DeckState } from './controller.ts'
import { resumeController, suspendController } from './controller-connection.ts'
import { deckFolioAt, deckFolios } from './deck-folios.ts'
import { dispatchElementError } from './element-error.ts'
import { upgradeProperties } from './element-properties.ts'
import type { FittedSize } from './fit.ts'
import { FramePool } from './frame-pool.ts'
import type { FrameTitle } from './frame-title.ts'
import { LAYOUT_FRAME_ATTRIBUTE } from './layout.ts'
import { requestSelection } from './selection-request.ts'
import { SlideFrameError } from './slide-frame-error.ts'
import { EMPTY_SLOTS, type PreparedSlots, slotFillRefusal } from './slot-render.ts'
import { prepareStageDay, stageDayChangesFrames } from './stage-day.ts'
import { stageFrameEvents } from './stage-frame-events.ts'
import { measureStage } from './stage-measure.ts'
import { defineStagePropertyAccessors } from './stage-property-accessors.ts'
import { StageFrameRebuilder } from './stage-rebuild.ts'
import type { StageReserve } from './stage-reserve.ts'
import { SLIDE_CHANGED_SELECTION_ERROR, shownScripts, stageSelectionRefusal } from './stage-selection.ts'
import { surfacePreflightFor } from './surface-preflight.ts'
import type { HostTransition } from './transition.ts'
import { parseTransitionProperty, transitionFromAttributes } from './transition-option.ts'
export class SegnaviaStage extends AsOfElement {
  static observedAttributes = ['src', 'neighbors', 'fit', 'transition', 'transition-duration']
  static {
    defineStagePropertyAccessors(SegnaviaStage.prototype)
  }
  declare css: string
  declare cspExtra: string
  declare origins: Iterable<OriginApproval>
  declare bridgeReadyTimeoutMs: number
  declare frameTitle: FrameTitle
  private owned: DeckController | null = null
  private attached: DeckController | null = null
  private room: StageReserve = {}
  private measured: FittedSize | null = null
  private resize = new ResizeObserver(() => this.measure())
  private pool = new FramePool(this, () => this.poolChanged(), stageFrameEvents(this))
  private transitionProperty: HostTransition | undefined
  private authoringRefusesScripts = false
  private viewportBlockSize = false
  private slotOptions: SlotsOptions | undefined
  private resolvedSlots: PreparedSlots | undefined
  private slotDeck: DeckState['deck'] = null
  private slotGeneration = 0
  private slotPreparation: AbortController | undefined
  private frameRebuilder = new StageFrameRebuilder(
    this.pool,
    () => this.attached,
    () => this.isConnected,
    (state) => this.update(state),
  )
  private selectionRequests = new Map<(reason: Error) => void, { frame: HTMLIFrameElement; slideId: string }>()
  constructor() {
    super()
    upgradeProperties(this)
  }
  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  get profile(): PreflightProfileInput {
    return surfacePreflightFor(this).profile
  }

  set profile(value: PreflightProfileInput) {
    surfacePreflightFor(this).profile = value
    this.rebuildFrames()
  }

  set slots(value: SlotsOptions | undefined) {
    this.cancelSelectionRequests()
    this.cancelSlotPreparation()
    this.slotGeneration++
    this.slotOptions = value
    this.slotDeck = null
    this.rebuildFrames()
  }

  protected asOfInputsChanged(): void {
    this.slots = this.slotOptions
  }

  setAuthoringScriptsRefused(refused: boolean) {
    if (refused === this.authoringRefusesScripts) return
    this.authoringRefusesScripts = refused
    if (this.attached?.state.deck) this.update(this.attached.state)
  }

  get transition(): HostTransition | undefined {
    return this.transitionProperty ?? transitionFromAttributes(this.getAttribute('transition'), this.getAttribute('transition-duration'))
  }

  set transition(value: TransitionInput | 'none') {
    this.transitionProperty = parseTransitionProperty(value)
    if (this.attached?.state.deck) this.update(this.attached.state)
  }

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
    const controllerUnchanged = controller === this.attached
    this.cancelSelectionRequests()
    this.cancelSlotPreparation()
    this.slotGeneration++
    this.slotDeck = null
    this.resolvedSlots = undefined
    this.attached?.removeEventListener('change', this.onChange)
    this.attached = controller
    if (this.isConnected) controller?.connectWindow()
    else controller?.disconnectWindow()
    controller?.addEventListener('change', this.onChange)
    this.frameRebuilder.rebuild(controller, controllerUnchanged)
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
    if (this.attached) resumeController(this.attached)
    if (!this.owned) this.loadSource()
    if (this.attached?.state.deck) this.update(this.attached.state)
  }

  disconnectedCallback() {
    this.cancelSelectionRequests()
    this.cancelSlotPreparation()
    this.slotDeck = null
    this.resolvedSlots = undefined
    this.pool.cancelPending()
    this.pool.clear()
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
      if (this.attached) suspendController(this.attached)
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

  private onChange = (event: Event) => {
    const state = (event as CustomEvent<DeckState>).detail
    this.cancelSelectionRequestsExcept(state.slide?.id)
    this.update(state)
  }

  private loadSource() {
    const src = this.getAttribute('src')
    if (!src || !this.isConnected) return
    if (!this.owned) {
      const hash = this.getAttribute('hash')
      this.owned = new DeckController({ hash: hash === 'off' ? null : (hash ?? 'slide-'), prefetch: this.hasAttribute('prefetch'), brands: this.brands })
      this.controller = this.owned
    }
    this.owned.brands = this.brands
    void this.owned.loadUrl(src)
  }

  readSelection(): Promise<PageSelection> {
    const state = this.attached?.state
    const slideId = state?.slide?.id
    const frame = slideId ? this.pool.shownFrame(slideId) : null
    const scripts = state?.deck ? shownScripts(state.deck.scripts, this.authoringRefusesScripts) : null
    const refusal = stageSelectionRefusal(state?.content ?? null, scripts, frame !== null)
    if (refusal || !frame) return Promise.reject(refusal)
    const request = requestSelection(frame, (post) => this.pool.waitForActiveFrame(frame, post), 'slide')
    this.selectionRequests.set(request.cancel, { frame, slideId: slideId as string })
    void request.promise.then(
      () => this.selectionRequests.delete(request.cancel),
      () => this.selectionRequests.delete(request.cancel),
    )
    return request.promise
  }

  private update(state: DeckState) {
    const deck = state.deck
    if (!deck || !state.content) return
    if (this.slotDeck !== deck) {
      this.cancelSlotPreparation()
      this.slotGeneration++
      const refusal = slotFillRefusal(deck.scripts, deck.slots, this.slotOptions)
      const refreshFrames = stageDayChangesFrames(deck, this.slotOptions, refusal !== undefined)
      const generation = this.slotGeneration
      const controller = new AbortController()
      const asOfLoad = captureAsOfLoad(this)
      this.slotPreparation = controller
      this.slotDeck = deck
      this.resolvedSlots = EMPTY_SLOTS
      if (refusal) dispatchElementError(this, refusal)
      void prepareStageDay(deck, asOfLoad, refusal ? undefined : deck.slots, refusal ? undefined : this.slotOptions, controller.signal)
        .then(({ established, resolved }) => {
          if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration || this.slotDeck !== deck) return
          this.resolvedSlots = resolved
          dispatchAsof(this, established.day)
          if (refreshFrames) this.rebuildFrames()
        })
        .catch((error) => {
          if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration || this.slotDeck !== deck) return
          this.resolvedSlots = EMPTY_SLOTS
          if (refreshFrames) this.rebuildFrames()
          dispatchElementError(this, error)
        })
    }
    if (!this.resolvedSlots) return
    this.style.setProperty('--segnavia-aspect', `${deck.size.width} / ${deck.size.height}`)
    this.dataset.layout = deck.layout
    const scripts = shownScripts(deck.scripts, this.authoringRefusesScripts)
    const folios = deckFolios(deck)
    surfacePreflightFor(this).setSurface(
      deck.slides.map((slide, index) => ({ key: slide.id, folio: deckFolioAt(folios, index).text })),
      true,
    )
    const shownState = scripts === deck.scripts ? state : { ...state, deck: { ...deck, scripts } }
    this.pool.update(shownState, this.attached as DeckController, {
      neighbors: this.neighbors,
      css: this.css,
      csp: this.cspExtra,
      origins: this.origins,
      frameTitle: this.frameTitle,
      transition: this.transition,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      slots: this.resolvedSlots,
      bridgeReadyTimeoutMs: this.bridgeReadyTimeoutMs,
      preflight: surfacePreflightFor(this).resolvedProfile(),
      reportSlideError: (slideId, message) => {
        const error = new SlideFrameError(message, slideId, this.attached?.state.deck?.slides.findIndex((slide) => slide.id === slideId) ?? -1)
        dispatchElementError(this, error)
      },
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
    if (!deck) return
    const measured = measureStage(this, deck, this.room, this.fit, this.viewportBlockSize)
    if (!measured) return
    const { fitted } = measured
    this.viewportBlockSize = measured.ownsViewportBlockSize
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
    const message = messageFrom(event, this.pool.frames(), surfacePreflightFor(this).resolvedProfile())
    dispatchFontFailures(this, message)
    if (message?.type === MESSAGE.preflight && message.report && surfacePreflightFor(this).enabled) {
      const frame = this.pool.frames().find((candidate) => candidate.contentWindow === event.source)
      const slideId = frame?.closest<HTMLElement>('.segnavia-stage__canvas')?.dataset.slideId
      if (slideId) surfacePreflightFor(this).receive(slideId, message.report)
    }
    if (message?.type === MESSAGE.ready) this.pool.markReady(event.source)
    const failedFrame =
      message?.type === MESSAGE.composeFailure && message.text ? this.pool.frames().find((frame) => frame.contentWindow === event.source) : undefined
    if (failedFrame?.hasAttribute(LAYOUT_FRAME_ATTRIBUTE)) dispatchElementError(this, new Error(message?.text ?? ''))
    if (message?.type === MESSAGE.slotFit && message.slots) this.resolvedSlots?.mergeFit(message.slots)
    if (message?.type === MESSAGE.key && message.key && event.source === this.pool.activeFrame()?.contentWindow) this.attached?.key(message.key)
  }
  private onResize = () => this.measure()

  private poolChanged() {
    const active = this.pool.activeFrame()
    const reason = new Error(SLIDE_CHANGED_SELECTION_ERROR)
    for (const [cancel, { frame }] of this.selectionRequests) {
      if (frame !== active) cancel(reason)
    }
    this.measure()
  }

  private cancelSelectionRequests() {
    const reason = new Error(SLIDE_CHANGED_SELECTION_ERROR)
    for (const cancel of [...this.selectionRequests.keys()]) cancel(reason)
  }

  private cancelSelectionRequestsExcept(slideId: string | undefined) {
    const reason = new Error(SLIDE_CHANGED_SELECTION_ERROR)
    for (const [cancel, request] of this.selectionRequests) {
      if (request.slideId !== slideId) cancel(reason)
    }
  }

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }

  private rebuildFrames() {
    this.frameRebuilder.rebuild(this.attached, true)
  }

  freezeAuthoringFrame(slideId: string, atMs: number) {
    const frame = [...this.pool.frames()].find((candidate) => candidate.closest<HTMLElement>('.segnavia-stage__canvas')?.dataset.slideId === slideId)
    frame?.contentWindow?.postMessage({ type: MESSAGE.freeze, atMs }, '*')
  }

  releaseAuthoringFrame(slideId: string) {
    const frame = [...this.pool.frames()].find((candidate) => candidate.closest<HTMLElement>('.segnavia-stage__canvas')?.dataset.slideId === slideId)
    frame?.contentWindow?.postMessage({ type: MESSAGE.release }, '*')
  }
  authoringAnimationMessage(event: MessageEvent): { slideId: string; animated: boolean; lengthMs: number | null } | null {
    for (const frame of this.pool.frames()) {
      const report = animationMessage(event, frame)
      const slideId = frame.closest<HTMLElement>('.segnavia-stage__canvas')?.dataset.slideId
      if (report && slideId) return { slideId, animated: report.animated, lengthMs: report.lengthMs }
    }
    return null
  }
  requestAuthoringAnimationReport() {
    this.pool.activeFrame()?.contentWindow?.postMessage({ type: MESSAGE.inspect }, '*')
  }
}
