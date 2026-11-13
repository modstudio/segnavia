import {
  type Document,
  type DocumentInput,
  type PageWidths,
  type PreflightProfileInput,
  pageOrPrintedFromDocument,
  paperViewport,
  resolveBrand,
  resolvePreflightProfile,
  type SlotsOptions,
} from '@segnavia/format'
import { parseDocument, printedPageDirection } from '@segnavia/html'
import { ensureBaseStyle } from './base-style.ts'
import { dispatchFontFailures, dispatchPreflight, MESSAGE, messageFrom } from './bridge.ts'
import { upgradeProperties } from './element-properties.ts'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { type PageParseOption, PageParseOptionsElement } from './page-parse-options-element.ts'
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
import { currentPrintedPage, type PrintedPagesFit, printedPagesWindow } from './printed-pages-policy.ts'
import { ReloadCoalescer } from './reload-coalescer.ts'
import { fillsSlotValues } from './slot-render.ts'

export type PrintedPagesLayout = 'single' | 'facing'
const positive = (value: number, name: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive number.`)
  return value
}
const nonNegative = (value: number, name: string) => {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative number.`)
  return value
}

export class SegnaviaPrintedPages extends PageParseOptionsElement {
  private documentValue: Document | null = null
  private papers = new Map<number, PrintedPaperState>()
  private abort: AbortController | undefined
  private generation = 0
  private currentPage = 1
  private count = 0
  private currentRecord: string | undefined
  private reloadAnchor: number | undefined
  private programmaticScrollTop: number | undefined
  private composeCurrent: ((page: number) => void) | undefined
  private layoutValue: PrintedPagesLayout = 'single'
  private fitValue: PrintedPagesFit = 'width'
  private zoomValue = 1
  private composeMarginValue = 1
  private keepMarginValue = 3
  private reloadDelayValue = 150
  private slotsValue: SlotsOptions | undefined
  private motifsValue: MotifsOptions | undefined
  private placementsValue: PlacementsOptions | undefined
  private widthsValue: PageWidths | undefined
  private fontsValue: FontsOptions | undefined
  private profileValue: PreflightProfileInput = 'default'
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
      renderPrintedPagesFailure(this, error)
    }
  }
  get page(): number {
    return this.currentPage
  }
  set page(value: number) {
    const requested = Math.trunc(positive(value, 'page'))
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
  get layout(): PrintedPagesLayout {
    return this.layoutValue
  }
  set layout(value: PrintedPagesLayout) {
    if (value !== 'single' && value !== 'facing') throw new RangeError("layout must be 'single' or 'facing'.")
    this.layoutValue = value
    this.schedule()
  }
  get fit(): PrintedPagesFit {
    return this.fitValue
  }
  set fit(value: PrintedPagesFit) {
    if (!['width', 'page', 'none'].includes(value)) throw new RangeError("fit must be 'width', 'page' or 'none'.")
    this.fitValue = value
    this.schedule()
  }
  get zoom(): number {
    return this.zoomValue
  }
  set zoom(value: number) {
    this.zoomValue = positive(value, 'zoom')
    this.schedule()
  }
  get composeMargin(): number {
    return this.composeMarginValue
  }
  set composeMargin(value: number) {
    this.composeMarginValue = nonNegative(value, 'composeMargin')
    this.updateWindow()
  }
  get keepMargin(): number {
    return this.keepMarginValue
  }
  set keepMargin(value: number) {
    this.keepMarginValue = nonNegative(value, 'keepMargin')
    this.updateWindow()
  }
  get reloadDelay(): number {
    return this.reloadDelayValue
  }
  set reloadDelay(value: number) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError('reloadDelay must be non-negative.')
    this.reloadDelayValue = value
  }
  get slots(): SlotsOptions | undefined {
    return this.slotsValue
  }
  set slots(value: SlotsOptions | undefined) {
    this.slotsValue = value
    this.schedule()
  }
  get motifs(): MotifsOptions | undefined {
    return this.motifsValue
  }
  set motifs(value: MotifsOptions | undefined) {
    this.motifsValue = value
    this.schedule()
  }
  get placements(): PlacementsOptions | undefined {
    return this.placementsValue
  }
  set placements(value: PlacementsOptions | undefined) {
    this.placementsValue = value
    this.schedule()
  }
  get pageWidths(): PageWidths | undefined {
    return this.widthsValue
  }
  set pageWidths(value: PageWidths | undefined) {
    this.widthsValue = value
    this.schedule()
  }
  get fonts(): FontsOptions | undefined {
    return this.fontsValue
  }
  set fonts(value: FontsOptions | undefined) {
    this.fontsValue = value
    this.schedule()
  }
  get profile(): PreflightProfileInput {
    return this.profileValue
  }
  set profile(value: PreflightProfileInput) {
    resolvePreflightProfile(value)
    this.profileValue = value
    this.schedule()
  }
  protected elementPropertyChanged(_property: string): void {
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
    this.abort?.abort()
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
    const generation = ++this.generation
    for (const state of this.papers.values()) {
      state.pending?.remove()
      state.pending = undefined
    }
    this.abort?.abort()
    const controller = new AbortController()
    this.abort = controller
    try {
      const brand = document.brand === undefined ? undefined : await resolveBrand(document, this.brands?.source, controller.signal)
      const source = pageOrPrintedFromDocument(document, brand)
      if (fillsSlotValues(source.slots, this.slotsValue)) throw new Error(PRINTED_SLOT_REFUSAL)
      const profile = resolvePreflightProfile(this.profileValue)
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
        report: (report) => this.dispatchEvent(new CustomEvent('preflight', { detail: report, bubbles: true, composed: true })),
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
    renderPrintedPagesFailure(this)
    this.refit()
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
    this.updateWindow()
    this.updateCurrent(keepPage)
    this.scrollIfMoved(keepPage)
  }

  private readonly onMessage = (event: MessageEvent) => {
    const state = [...this.papers.values()].find((item) => item.pending?.contentWindow === event.source || item.shown?.contentWindow === event.source)
    if (!state) return
    const frame = state.pending?.contentWindow === event.source ? state.pending : state.shown
    if (!frame || Number(frame.dataset.generation) !== this.generation) return
    const message = messageFrom(event, frame, resolvePreflightProfile(this.profileValue))
    dispatchFontFailures(this, message)
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
    this.abort?.abort()
    this.generation++
    this.count = 0
    this.papers.clear()
    this.replaceChildren()
    renderPrintedPagesFailure(this)
  }
}
