// <segnavia-page> shows a page in a sandboxed frame. Full pages grow; fixed pages scale to fit; composed papers fill the host-sized element and scroll inside it. Host-served HTML reports its height through the bridge.

import {
  type AsOfDay,
  type Document,
  type DocumentInput,
  type FontFailure,
  FULL_PAGE_SIZE,
  Page,
  type PageWidths,
  type PreflightProfileInput,
  resolvePreflightProfile,
  resolveAsOfDay,
  resolveDocumentDayResult,
  type SlotsOptions,
} from '@segnavia/format'
import { type AlertLabels, type EstablishedPageDay, type HtmlPage, parseDocument, slotsForDay } from '@segnavia/html'
import { captureAsOfLoad } from './as-of-element.ts'
import { ensureBaseStyle } from './base-style.ts'
import { dispatchFontFailures, MESSAGE, messageFrom, type PageSelection } from './bridge.ts'
import { internalPageDayLoad, internalPageLoad } from './document-value-load.ts'
import { upgradeProperties } from './element-properties.ts'
import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import { PageAsOfElement } from './page-as-of-element.ts'
import { loadBrandedPage } from './page-brand.ts'
import { loadShownPageDocument } from './page-document-loading.ts'
import { clearPageFrame, fitPageFrame, mountPageFrame, type PageFrameHeightState } from './page-element-layout.ts'
import { dispatchPageFailure } from './page-failure.ts'
import type { FontsOptions } from './page-fonts.ts'
import { type PageFrameIdentity, samePageFrame } from './page-frame.ts'
import { scrollPageToHeading } from './page-heading.ts'
import { printedPageComposeFailure, printedPageRequestRefusal } from './page-printed.ts'
import { cancelPageRequests, createPageRequestState, releaseReadyPageRequests } from './page-request.ts'
import { readPageSelection } from './page-selection.ts'
import { renderPageValue } from './page-value-render.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'
import type { PreparedSlots } from './slot-render.ts'

export { SELECTION_REPLY_MS } from './selection-request.ts'
export class SegnaviaPage extends PageAsOfElement {
  static observedAttributes = ['src', 'bounded', 'label']
  private alertLabelOptions: Partial<AlertLabels> | undefined
  private pageInput: DocumentInput | unknown
  private pageValue: Page | null = null
  private documentValue: Document | null = null
  private frameHeight: PageFrameHeightState = { contentHeight: 0, ownsElementHeight: false }
  private resize = new ResizeObserver(() => this.fit())
  private slotOptions: SlotsOptions | undefined
  private motifOptions: MotifsOptions | undefined
  private placementOptions: PlacementsOptions | undefined
  private widthOptions: PageWidths | undefined
  private fontOptions: FontsOptions | undefined
  private loadGeneration = 0
  private brandResolution: AbortController | undefined
  private slotPreparation: AbortController | undefined
  private resolvedSlots: PreparedSlots | undefined
  private slotFrame: PageFrameIdentity | undefined
  private composedFrame: PageFrameIdentity | undefined
  private hostServed = false
  private documentWrites = 0
  private loadedDocument: number | undefined
  private frameReady = false
  private pageRequests = createPageRequestState()
  private profileInput: PreflightProfileInput = 'default'
  constructor() {
    super()
    upgradeProperties(this)
  }
  get alertLabels(): Partial<AlertLabels> | undefined {
    return this.alertLabelOptions
  }
  set alertLabels(value: Partial<AlertLabels> | undefined) {
    this.alertLabelOptions = value
    if (this.pageInput !== undefined) this.load(this.pageInput)
    else if (this.pageValue) this.loadValue(this.pageValue)
  }
  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }
  set slots(value: SlotsOptions | undefined) {
    this.slotOptions = value
    if (this.pageValue) this.loadValue(this.pageValue)
  }
  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }
  set motifs(value: MotifsOptions | undefined) {
    this.motifOptions = value
    if (this.pageValue) this.loadValue(this.pageValue)
  }
  get placements(): PlacementsOptions | undefined {
    return this.placementOptions
  }
  set placements(value: PlacementsOptions | undefined) {
    this.placementOptions = value
    if (this.pageValue) this.loadValue(this.pageValue)
  }

  protected asOfInputsChanged(): void {
    if (this.pageValue) this.loadValue(this.pageValue)
  }

  get pageWidths(): PageWidths | undefined {
    return this.widthOptions
  }

  set pageWidths(value: PageWidths | undefined) {
    const parsed = parsePageWidths(value)
    if (samePageWidths(this.widthOptions, parsed)) return
    this.widthOptions = parsed
    if (this.pageValue) this.loadValue(this.pageValue)
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    if (this.pageValue) this.loadValue(this.pageValue)
  }
  get profile(): PreflightProfileInput {
    return this.profileInput
  }
  set profile(value: PreflightProfileInput) {
    resolvePreflightProfile(value)
    this.profileInput = value
    if (this.pageValue) this.loadValue(this.pageValue)
  }

  protected brandsChanged() {
    if (this.pageInput !== undefined) this.load(this.pageInput)
  }

  get page(): Document | null {
    return this.documentValue
  }

  set page(value: DocumentInput | null | undefined) {
    if (value == null) {
      this.releaseFrame()
      this.brandResolution?.abort()
      this.brandResolution = undefined
      this.pageValue = null
      this.documentValue = null
      this.pageInput = undefined
      this.hostServed = false
      this.frameHeight.contentHeight = 0
      clearPageFrame(this, this.frameHeight)
      return
    }
    this.load(value)
  }

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    window.addEventListener('message', this.onMessage)
    this.resize.observe(this)
    if (this.pageValue) this.loadValue(this.pageValue)
  }

  disconnectedCallback() {
    this.cancelSelectionRequests()
    this.cancelSlotPreparation()
    window.removeEventListener('message', this.onMessage)
    this.resize.disconnect()
  }

  async attributeChangedCallback(name: string, _: string | null, value: string | null) {
    if (name === 'bounded') {
      this.fit()
      return
    }
    if (name === 'label') {
      const iframe = this.querySelector<HTMLIFrameElement>('iframe')
      if (iframe) iframe.title = value || 'Page'
      return
    }
    if (!value) return
    const response = await fetch(new URL(value, location.href))
    if (!response.ok) throw new Error(`The page at ${value} answered ${response.status}.`)
    this.load(await response.json())
  }

  load(input: DocumentInput | unknown) {
    const document = parseDocument(input, { alertLabels: this.alertLabels })
    this.brandResolution?.abort()
    const controller = new AbortController()
    this.brandResolution = controller
    this.pageInput = input
    this.documentValue = document
    loadBrandedPage(
      document,
      this.brands,
      controller.signal,
      (page) => {
        if (this.documentValue === document) this.loadValue(page)
      },
      this,
    )
  }

  [internalPageLoad](page: Page) {
    this.brandResolution?.abort()
    this.brandResolution = undefined
    this.pageInput = undefined
    this.documentValue = null
    this.loadValue(page)
  }
  [internalPageDayLoad](page: Page, established: EstablishedPageDay) {
    this.brandResolution?.abort()
    this.brandResolution = undefined
    this.pageInput = undefined
    this.documentValue = null
    this.loadValue(page, established)
  }
  private loadValue(page: Page, established?: EstablishedPageDay) {
    this.hostServed = false
    const generation = this.releaseFrame()
    const controller = new AbortController()
    this.slotPreparation = controller
    const iframe = this.mount(page)
    const isCurrent = () => this.isConnected && !controller.signal.aborted && generation === this.loadGeneration && iframe === this.querySelector('iframe')
    const show = (shownPage: HtmlPage, resolved?: PreparedSlots, fontCss = '', fontFailures: FontFailure[] = []) => {
      if (!isCurrent()) return
      loadShownPageDocument(
        shownPage,
        resolved,
        { baseCss: fontCss, css: this.css, csp: this.cspExtra || undefined, origins: this.origins, fontFailures },
        (document) => {
          if (!isCurrent()) return
          this.resolvedSlots = resolved
          this.slotFrame = resolved ? { frame: iframe, generation } : undefined
          this.cancelPostedSelectionRequests()
          this.writeDocument(iframe, document)
        },
        report,
      )
    }
    const report = (error: unknown) => dispatchPageFailure(this, error, isCurrent())
    const write = (document: string) => {
      if (isCurrent()) this.writeDocument(iframe, document)
    }
    const { moment, hostZone, anchors } = captureAsOfLoad(this)
    const facts = {
      moment,
      hostZone,
      anchors,
      signal: controller.signal,
    }
    const render = (day: AsOfDay, slots: SlotsOptions) => {
      if (!isCurrent()) return
      if (!established) this.dispatchEvent(new CustomEvent('asof', { detail: day }))
      renderPageValue(
        page,
        day,
        slots,
        controller.signal,
        { frame: iframe, generation },
        {
          motifs: this.motifOptions,
          placements: this.placementOptions,
          widths: this.widthOptions,
          fonts: this.fontOptions,
          css: this.css,
          csp: this.cspExtra || undefined,
          origins: this.origins,
          profile: this.profileInput,
        },
        { show, report, write, composed: (identity) => (this.composedFrame = identity), fit: () => this.fit() },
      )
    }
    const policy = resolveAsOfDay(page.asOf, facts)
    if (established) {
      render(established.day, established.slots)
    } else if (policy.kind === 'day' && !this.slotOptions?.resolve) {
      render(policy.day, { ...this.slotOptions, resolve: undefined, source: this.slotOptions?.source })
    } else {
      void resolveDocumentDayResult(policy, facts)
        .then(async (day) => ({ day, slots: await slotsForDay(this.slotOptions, day, controller.signal) }))
        .then(({ day, slots }) => render(day, slots))
        .catch(report)
    }
    this.fit()
  }

  showUrl(url: string, size: Page['size'] = FULL_PAGE_SIZE) {
    this.hostServed = true
    this.releaseFrame()
    const iframe = this.mount(Page.parse({ html: '', size }))
    // Host-served documents do not track readiness because readSelection refuses them.
    iframe.src = new URL(url, location.href).href
    this.fit()
  }
  readSelection(): Promise<PageSelection> {
    const refusal = printedPageRequestRefusal(this.pageValue, 'selection')
    if (refusal) return Promise.reject(refusal)
    return readPageSelection(this.pageValue, this.querySelector('iframe'), this.hostServed, this.frameReady, this.pageRequests)
  }
  /** Scrolls to an id returned by `markdownOutline(page.body)`, resolving false when no heading has that id. */
  scrollToHeading(id: string, options?: { behavior?: ScrollBehavior }): Promise<boolean> {
    const refusal = printedPageRequestRefusal(this.pageValue, 'heading')
    if (refusal) return Promise.reject(refusal)
    return scrollPageToHeading(
      id,
      options,
      this.pageValue,
      this.querySelector('iframe'),
      this.querySelector('.segnavia-page__sheet'),
      this.hostServed,
      this.frameReady,
      this.pageRequests,
    )
  }

  private mount(page: Page): HTMLIFrameElement {
    this.resetDocumentReadiness()
    this.pageValue = page
    this.frameHeight.contentHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : 0
    delete this.dataset.measured
    return mountPageFrame(this, page, this.widthOptions, this.label)
  }

  /** Drops what belongs to the current frame and returns the generation of the next one. */
  private releaseFrame(): number {
    this.cancelSelectionRequests()
    this.cancelSlotPreparation()
    this.resolvedSlots = undefined
    this.slotFrame = undefined
    this.composedFrame = undefined
    return ++this.loadGeneration
  }

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }
  private cancelSelectionRequests() {
    cancelPageRequests(this.pageRequests)
  }

  private cancelPostedSelectionRequests() {
    cancelPageRequests(this.pageRequests, true)
  }

  private resetDocumentReadiness() {
    this.frameReady = false
    this.loadedDocument = undefined
  }

  private writeDocument(iframe: HTMLIFrameElement, srcdoc: string) {
    const written = ++this.documentWrites
    this.resetDocumentReadiness()
    iframe.addEventListener(
      'load',
      () => {
        if (written === this.documentWrites) this.loadedDocument = written
      },
      { once: true },
    )
    iframe.srcdoc = srcdoc
  }

  private fit() {
    const page = this.pageValue
    const sheet = this.querySelector<HTMLElement>('.segnavia-page__sheet')
    if (!page || !sheet) return
    fitPageFrame(this, page, sheet, this.frameHeight, this.bounded)
  }

  private onMessage = (event: MessageEvent) => {
    const frame = this.querySelector('iframe')
    const message = messageFrom(event, frame, resolvePreflightProfile(this.profileInput))
    const currentFrame = { frame, generation: this.loadGeneration }
    dispatchFontFailures(this, message)
    if (message?.type === MESSAGE.ready && this.loadedDocument === this.documentWrites) {
      this.frameReady = true
      releaseReadyPageRequests(this.pageRequests)
    }
    const page = this.pageValue
    if (message?.type === MESSAGE.preflight && message.report && samePageFrame(currentFrame, this.composedFrame)) {
      this.dispatchEvent(new CustomEvent('preflight', { detail: message.report }))
      return
    }
    const composeFailure = printedPageComposeFailure(message, MESSAGE.composeFailure, currentFrame, this.composedFrame)
    if (composeFailure) {
      dispatchPageFailure(this, composeFailure, true)
      return
    }
    if (message?.type === MESSAGE.slotFit && message.slots && samePageFrame(currentFrame, this.slotFrame)) this.resolvedSlots?.mergeFit(message.slots)
    if (!page || message?.type !== MESSAGE.height || message.height === undefined) return
    if (page.printedPages) return
    // A fixed sheet keeps its own height whatever its content reports.
    if (typeof page.size === 'object' && page.size.height !== 'auto') return
    this.frameHeight.contentHeight = message.height
    this.dataset.measured = ''
    this.fit()
  }
}
export function createPageElement(): SegnaviaPage {
  if (!customElements.get(HEADLESS_ELEMENTS.page)) customElements.define(HEADLESS_ELEMENTS.page, SegnaviaPage)
  return document.createElement(HEADLESS_ELEMENTS.page) as SegnaviaPage
}
