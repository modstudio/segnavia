import { type Document, type DocumentInput, pageOrPrintedFromDocument, paperViewport, resolveBrand, resolvePreflightProfile } from '@segnavia/format'
import { parseDocument, printedPageDirection } from '@segnavia/html'
import { captureAsOfLoad, dispatchAsof } from './as-of-element.ts'
import { resolvePageDayLoad } from './as-of-slots.ts'
import { ensureBaseStyle } from './base-style.ts'
import { dispatchFontFailures, dispatchPreflight, MESSAGE, messageFrom } from './bridge.ts'
import { upgradeProperties } from './element-properties.ts'
import type { PageParseOption } from './page-parse-options-element.ts'
import { PRINTED_SLOT_REFUSAL } from './page-printed.ts'
import {
  buildPrintedPagesDom,
  composePrintedPaper,
  type PrintedPaperState,
  printedPaperExtents,
  refitPrintedPagesDom,
  renderPrintedPagesFailure,
  scrollToPrintedPaper,
} from './printed-pages-dom.ts'
import { type PreparedPrintedPages, preparePrintedPages } from './printed-pages-load.ts'
import { PrintedPagesOptionsElement, positivePrintedPagesOption } from './printed-pages-options.ts'
import { currentPrintedPage, printedPagesWindow } from './printed-pages-policy.ts'
import { ReloadCoalescer } from './reload-coalescer.ts'
import { fillsSlotValues } from './slot-render.ts'

export class SegnaviaPrintedPages extends PrintedPagesOptionsElement {
  private documentValue: Document | null = null
  private papers = new Map<number, PrintedPaperState>()
  private abort: AbortController | undefined
  private generation = 0
  private appliedGeneration = 0
  private fontFailureGeneration: number | undefined
  private currentPage = 1
  private count = 0
  private currentRecord: string | undefined
  private reloadAnchor: number | undefined
  private programmaticScrollTop: number | undefined
  private composeCurrent: ((page: number) => void) | undefined
  private recordMapping: (page: number) => string | undefined = () => undefined
  private readonly resize = new ResizeObserver(() => this.refit())
  private readonly reloads = new ReloadCoalescer(
    { set: (callback, delay) => window.setTimeout(callback, delay), clear: (timer) => window.clearTimeout(timer as number) },
    () => void this.reload(),
  )

  constructor() {
    super()
    upgradeProperties(this)
  }

  get document(): Document | null {
    return this.documentValue
  }
  set document(value: DocumentInput | null | undefined) {
    if (value == null) {
      this.documentValue = null
      this.clear()
      return
    }
    try {
      this.documentValue = parseDocument(value, { alertLabels: this.alertLabels, newId: this.newId })
      this.schedule()
    } catch (error) {
      this.documentValue = null
      this.discardLoad()
      renderPrintedPagesFailure(this, error)
    }
  }
  get page(): number {
    return this.currentPage
  }
  set page(value: number) {
    const requested = Math.trunc(positivePrintedPagesOption(value, 'page'))
    if (this.count) this.scrollToPage(Math.min(this.count, requested))
    else this.currentPage = requested
  }
  get pageCount(): number {
    return this.count
  }
  get record(): string | undefined {
    return this.currentRecord
  }
  get recordFor(): (page: number) => string | undefined {
    return this.recordMapping
  }
  set recordFor(value: (page: number) => string | undefined) {
    this.recordMapping = value
    this.updateCurrent(this.currentPage)
    this.schedule()
  }
  protected printedPagesReload(): void {
    this.schedule()
  }
  protected printedPagesWindowChanged(): void {
    this.updateWindow()
  }
  protected stylesheetPropertyChanged(_property: string): void {
    this.schedule()
  }
  protected pageParseOptionsChanged(_option: PageParseOption): void {
    if (this.documentValue) this.schedule()
  }
  protected asOfInputsChanged(): void {
    this.schedule()
  }
  protected brandsChanged(): void {
    this.schedule()
  }
  connectedCallback(): void {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    this.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('message', this.onMessage)
    this.resize.observe(this)
    this.schedule()
  }
  disconnectedCallback(): void {
    this.reloads.cancel()
    this.discardLoad()
    this.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('message', this.onMessage)
    this.resize.disconnect()
  }
  next(): void {
    this.navigate(this.layoutValue === 'facing' ? 2 : 1)
  }
  previous(): void {
    this.navigate(this.layoutValue === 'facing' ? -2 : -1)
  }
  goToRecord(id: string): void {
    for (let page = 1; page <= this.count; page++) {
      if (this.recordMapping(page) !== id) continue
      this.scrollToPage(page)
      return
    }
    throw new RangeError(
      `Cannot go to record ${JSON.stringify(id)} because no page maps to it; change recordFor or request a mapped record to clear this refusal.`,
    )
  }

  private schedule(): void {
    if (this.isConnected && this.documentValue) {
      this.reloadAnchor ??= this.currentPage
      this.reloads.schedule(this.reloadDelayValue)
    }
  }
  private async reload(): Promise<void> {
    const document = this.documentValue
    if (!document) return
    const keepPage = this.reloadAnchor ?? this.currentPage
    this.reloadAnchor = undefined
    this.discardLoad()
    const generation = this.generation
    const asOfLoad = captureAsOfLoad(this)
    for (const state of this.papers.values()) {
      state.pending?.remove()
      state.pending = undefined
    }
    const controller = new AbortController()
    this.abort = controller
    try {
      const brand = document.brand === undefined ? undefined : await resolveBrand(document, this.brands?.source, controller.signal)
      const source = pageOrPrintedFromDocument(document, brand)
      if (fillsSlotValues(source.slots, this.slotsValue)) throw new Error(PRINTED_SLOT_REFUSAL)
      const profile = resolvePreflightProfile(this.profileValue)
      const established = await Promise.resolve(resolvePageDayLoad(source, asOfLoad, this.slotsValue, controller.signal))
      if (generation !== this.generation || controller.signal.aborted) return
      dispatchAsof(this, established.day)
      const prepared = await preparePrintedPages(source, {
        signal: controller.signal,
        motifs: this.motifsValue,
        placements: this.placementsValue,
        widths: this.widthsValue,
        fonts: this.fontsValue,
        css: this.css,
        csp: this.cspExtra || undefined,
        origins: this.origins,
        profile,
        day: established.day,
        report: (report) => {
          if (generation === this.generation && !controller.signal.aborted)
            this.dispatchEvent(new CustomEvent('preflight', { detail: report, bubbles: true, composed: true }))
        },
      })
      if (generation !== this.generation || controller.signal.aborted) return
      this.applyPrepared(prepared, generation, keepPage)
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) renderPrintedPagesFailure(this, error)
    }
  }

  private applyPrepared(prepared: PreparedPrintedPages, generation: number, readingPage: number): void {
    const viewport = paperViewport(prepared.page.print as NonNullable<PreparedPrintedPages['page']['print']>)
    const direction = printedPageDirection(prepared.page)
    const keepPage = Math.min(readingPage, prepared.count)
    const geometry = `${prepared.count}:${direction}:${viewport.width}:${viewport.height}:${this.layoutValue}`
    if (this.dataset.geometry !== geometry) this.papers = buildPrintedPagesDom(this, prepared.count, direction, viewport, this.layoutValue)
    this.dataset.geometry = geometry
    this.count = prepared.count
    this.appliedGeneration = generation
    renderPrintedPagesFailure(this)
    this.composeCurrent = (page) => {
      const state = this.papers.get(page)
      if (state)
        composePrintedPaper(state, prepared, page, generation, {
          css: this.css,
          csp: this.cspExtra || undefined,
          origins: this.origins,
          profile: resolvePreflightProfile(this.profileValue),
        })
    }
    this.refit()
    this.updateWindow()
    this.updateCurrent(keepPage)
    this.scrollIfMoved(keepPage)
  }

  private readonly onMessage = (event: MessageEvent) => {
    const state = [...this.papers.values()].find((item) => item.pending?.contentWindow === event.source || item.shown?.contentWindow === event.source)
    if (!state) return
    const frame = state.pending?.contentWindow === event.source ? state.pending : state.shown
    if (!frame || Number(frame.dataset.generation) !== this.appliedGeneration) return
    const message = messageFrom(event, frame, resolvePreflightProfile(this.profileValue))
    if (message?.failures && this.fontFailureGeneration !== this.appliedGeneration) {
      this.fontFailureGeneration = this.appliedGeneration
      dispatchFontFailures(this, message)
    }
    if (dispatchPreflight(this, message)) return
    if (message?.type === MESSAGE.composeFailure && message.text) return renderPrintedPagesFailure(this, new Error(message.text))
    if (message?.type !== MESSAGE.ready || frame !== state.pending) return
    state.shown?.remove()
    frame.style.visibility = ''
    state.shown = frame
    state.pending = undefined
    state.srcdoc = frame.srcdoc
  }
  private readonly onScroll = () => {
    this.updateWindow()
    if (this.programmaticScrollTop !== undefined && Math.abs(this.scrollTop - this.programmaticScrollTop) < 2) return
    this.programmaticScrollTop = undefined
    this.updateCurrent()
  }
  private extents() {
    return printedPaperExtents(this, this.papers.values())
  }
  private updateWindow(): void {
    if (!this.papers.size) return
    const viewport = this.clientHeight
    const policy = printedPagesWindow(this.extents(), this.scrollTop, viewport, viewport * this.composeMarginValue, viewport * this.keepMarginValue)
    for (const page of policy.compose) this.composeCurrent?.(page)
    const keep = new Set(policy.keep)
    for (const state of this.papers.values())
      if (!keep.has(state.page)) {
        state.shown?.remove()
        state.pending?.remove()
        state.shown = undefined
        state.pending = undefined
        state.srcdoc = undefined
        state.nonce = undefined
      }
  }
  private refit(): void {
    refitPrintedPagesDom(this, this.fitValue, this.zoomValue)
    this.updateWindow()
  }
  private navigate(delta: number): void {
    this.scrollToPage(Math.max(1, Math.min(this.count, this.currentPage + delta)))
  }
  private scrollToPage(page: number): void {
    this.programmaticScrollTop = scrollToPrintedPaper(this, this.papers, page)
    this.updateCurrent(page)
  }
  private scrollIfMoved(page: number): void {
    if (currentPrintedPage(this.extents(), this.scrollTop) !== page) this.scrollToPage(page)
  }
  private updateCurrent(page = currentPrintedPage(this.extents(), this.scrollTop) ?? this.currentPage): void {
    const next = Math.max(1, Math.min(this.count || 1, page))
    if (next !== this.currentPage) {
      this.currentPage = next
      this.dispatchEvent(new CustomEvent('page', { detail: { page: next, pageCount: this.count } }))
    }
    const record = this.recordMapping(next)
    if (record !== this.currentRecord) {
      this.currentRecord = record
      this.dispatchEvent(new CustomEvent('record', { detail: { record } }))
    }
  }
  private clear(): void {
    this.discardLoad()
    delete this.dataset.geometry
    this.count = 0
    this.currentPage = 1
    this.currentRecord = undefined
    this.reloadAnchor = undefined
    this.composeCurrent = undefined
    this.appliedGeneration = 0
    this.fontFailureGeneration = undefined
    this.papers.clear()
    this.replaceChildren()
    renderPrintedPagesFailure(this)
    this.dispatchEvent(new CustomEvent('page', { detail: { page: 1, pageCount: 0 } }))
    this.dispatchEvent(new CustomEvent('record', { detail: { record: undefined } }))
  }
  private discardLoad(): void {
    this.abort?.abort()
    this.abort = undefined
    this.generation++
  }
}
