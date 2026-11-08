// <segnavia-page> shows a page in a sandboxed frame. Full pages follow the
// element and grow; fixed pages scale to fit; named widths cap the centered
// sheet, with only overridable geometry. `showUrl` shows host-served HTML whose
// own `bridgeForHost` reports height. data-measured is set once the
// content has reported its height, and data-height holds it.

import {
  type Document,
  type DocumentInput,
  FULL_PAGE_SIZE,
  Page,
  type PageWidths,
  pageDirection,
  pageFromDocument,
  printProperties,
  resolveBrand,
  type SlotsOptions,
} from '@segnavia/format'
import { type AlertLabels, type HtmlPage, parseDocument, resolvePageHtml } from '@segnavia/html'
import { ensureBaseStyle } from './base-style.ts'
import type { BrandsOptions } from './brands.ts'
import { frameSandbox, frameStyleSheets, MESSAGE, messageFrom, type PageSelection } from './bridge.ts'
import { internalPageLoad } from './document-value-load.ts'
import { upgradeProperties } from './element-properties.ts'
import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { framePageMotifRefusal, type MotifsOptions, type PlacementsOptions, prepareShownPage } from './motif-expansion.ts'
import { loadPageDocument, loadShownPageDocument } from './page-document-loading.ts'
import { PageElementAttributes } from './page-element-attributes.ts'
import type { FontsOptions } from './page-fonts.ts'
import { scrollPageToHeading } from './page-heading.ts'
import { pageSheetLayout } from './page-layout.ts'
import { cancelPageRequests, createPageRequestState, releaseReadyPageRequests } from './page-request.ts'
import { readPageSelection } from './page-selection.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal } from './slot-render.ts'

const PLACEHOLDER_HEIGHT = 150

export { SELECTION_REPLY_MS } from './selection-request.ts'

export class SegnaviaPage extends PageElementAttributes {
  static observedAttributes = ['src', 'bounded', 'label']
  private alertLabelOptions: Partial<AlertLabels> | undefined
  private pageInput: DocumentInput | unknown
  private pageValue: Page | null = null
  private documentValue: Document | null = null
  private contentHeight = 0
  private resize = new ResizeObserver(() => this.fit())
  private slotOptions: SlotsOptions | undefined
  private motifOptions: MotifsOptions | undefined
  private placementOptions: PlacementsOptions | undefined
  private widthOptions: PageWidths | undefined
  private fontOptions: FontsOptions | undefined
  private brandOptions: BrandsOptions | undefined
  private loadGeneration = 0
  private slotPreparation: AbortController | undefined
  private resolvedSlots: PreparedSlots | undefined
  private slotFrame: { frame: HTMLIFrameElement; generation: number } | undefined
  private hostServed = false
  private documentWrites = 0
  private loadedDocument: number | undefined
  private frameReady = false
  private pageRequests = createPageRequestState()

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

  get brands(): BrandsOptions | undefined {
    return this.brandOptions
  }

  set brands(value: BrandsOptions | undefined) {
    this.brandOptions = value
    if (this.pageInput !== undefined) this.load(this.pageInput)
  }

  get page(): Document | null {
    return this.documentValue
  }

  set page(value: DocumentInput | null | undefined) {
    if (value == null) {
      this.cancelSelectionRequests()
      this.cancelSlotPreparation()
      this.loadGeneration++
      this.resolvedSlots = undefined
      this.slotFrame = undefined
      this.pageValue = null
      this.documentValue = null
      this.pageInput = undefined
      this.hostServed = false
      this.contentHeight = 0
      this.replaceChildren()
      this.style.removeProperty('height')
      delete this.dataset.height
      delete this.dataset.measured
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
    this.pageInput = input
    const document = parseDocument(input, { alertLabels: this.alertLabels })
    this.documentValue = document
    if (document.brand === undefined) {
      this.loadValue(pageFromDocument(document))
      return
    }
    const controller = new AbortController()
    void resolveBrand(document, this.brandOptions?.source, controller.signal)
      .then((brand) => this.loadValue(pageFromDocument(document, brand)))
      .catch((error) => this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) })))
  }

  [internalPageLoad](page: Page) {
    this.pageInput = undefined
    this.documentValue = null
    this.loadValue(page)
  }

  private loadValue(page: Page) {
    const resolvedPage = resolvePageHtml(page)
    this.cancelSelectionRequests()
    this.hostServed = false
    this.cancelSlotPreparation()
    this.resolvedSlots = undefined
    this.slotFrame = undefined
    const controller = new AbortController()
    this.slotPreparation = controller
    const generation = ++this.loadGeneration
    const iframe = this.mount(page)
    const show = (shownPage: HtmlPage, resolved?: PreparedSlots, fontCss = '') => {
      if (!this.isConnected || controller.signal.aborted || generation !== this.loadGeneration || iframe !== this.querySelector('iframe')) return
      loadShownPageDocument(
        shownPage,
        resolved,
        { baseCss: fontCss, css: this.css, csp: this.cspExtra || undefined, dependencyOrigins: this.dependencyOrigins },
        (document) => {
          if (!this.isConnected || controller.signal.aborted || generation !== this.loadGeneration || iframe !== this.querySelector('iframe')) return
          this.resolvedSlots = resolved
          this.slotFrame = resolved ? { frame: iframe, generation } : undefined
          this.cancelPostedSelectionRequests()
          this.writeDocument(iframe, document)
        },
        report,
      )
    }
    const report = (error: unknown) => {
      if (!controller.signal.aborted && this.isConnected && generation === this.loadGeneration)
        this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
    }
    if (!this.motifOptions && !this.fontOptions && !this.placementOptions && !(page.style?.fonts ?? []).some((ref) => 'app' in ref)) {
      const motifRefusal = framePageMotifRefusal(resolvedPage)
      if (motifRefusal) {
        report(motifRefusal)
        this.fit()
        return
      }
      let sheets: string[]
      try {
        sheets = frameStyleSheets(page.style, page.brand, page.print ? printProperties(page.print) : '')
      } catch (error) {
        report(error)
        this.fit()
        return
      }
      loadPageDocument(
        resolvedPage,
        {
          scripts: page.scripts,
          dir: pageDirection(resolvedPage),
          lang: page.lang,
          sheets,
          css: this.css,
          csp: this.cspExtra || undefined,
          dependencyOrigins: this.dependencyOrigins,
          relayKeys: false,
        },
        (document) => {
          if (!this.isConnected || controller.signal.aborted || generation !== this.loadGeneration || iframe !== this.querySelector('iframe')) return
          this.writeDocument(iframe, document)
        },
        report,
      )
      const refusal = slotFillRefusal(resolvedPage.scripts, resolvedPage.slots, this.slotOptions)
      if (refusal) report(refusal)
      else if (hasSlotWork(resolvedPage.slots, this.slotOptions))
        void prepareSlots(resolvedPage.slots, this.slotOptions, controller.signal)
          .then((resolved) => show(resolvedPage, resolved))
          .catch(report)
      this.fit()
      return
    }
    void prepareShownPage(resolvedPage, this.motifOptions, this.slotOptions, this.fontOptions, controller.signal, this.placementOptions, this.widthOptions)
      .then(({ page: shownPage, resolved, css }) => show(shownPage, resolved, css))
      .catch(report)
    this.fit()
  }

  showUrl(url: string, size: Page['size'] = FULL_PAGE_SIZE) {
    this.cancelSelectionRequests()
    this.hostServed = true
    this.cancelSlotPreparation()
    this.loadGeneration++
    this.resolvedSlots = undefined
    this.slotFrame = undefined
    const iframe = this.mount(Page.parse({ html: '', size }))
    // Host-served documents do not track readiness because readSelection refuses them.
    iframe.src = new URL(url, location.href).href
    this.fit()
  }

  readSelection(): Promise<PageSelection> {
    return readPageSelection(this.pageValue, this.querySelector('iframe'), this.hostServed, this.frameReady, this.pageRequests)
  }

  /** Scrolls to an id returned by `markdownOutline(page.body)`, resolving false when no heading has that id. */
  scrollToHeading(id: string, options?: { behavior?: ScrollBehavior }): Promise<boolean> {
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
    this.contentHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : 0
    delete this.dataset.measured
    const sheet = document.createElement('div')
    sheet.className = 'segnavia-page__sheet'
    // Laid out left to right whatever the host's direction: it is scaled from
    // its top-left corner, and the page inside keeps its own direction.
    sheet.dir = 'ltr'
    const width = pageSheetLayout(page.size, this.widthOptions)
    sheet.style.inlineSize = width.inlineSize
    if (width.maxInlineSize !== undefined) sheet.style.maxInlineSize = `${width.maxInlineSize}px`
    if (width.marginInline !== undefined) sheet.style.marginInline = width.marginInline
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', frameSandbox(page.scripts))
    iframe.title = this.label || 'Page'
    sheet.append(iframe)
    this.replaceChildren(sheet)
    return iframe
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
    const fluidBounded = page.size.height === 'auto' && page.size.width === 'full' && this.bounded
    if (fluidBounded) {
      sheet.style.height = '100%'
      sheet.style.removeProperty('transform')
      this.style.removeProperty('height')
      if (this.contentHeight) this.dataset.height = String(this.contentHeight)
      else delete this.dataset.height
      return
    }
    const width = typeof page.size.width === 'number' ? page.size.width : null
    const scale = width === null ? 1 : Math.min(1, this.clientWidth / width)
    const height = this.contentHeight || PLACEHOLDER_HEIGHT
    sheet.style.height = `${height}px`
    sheet.style.transform = scale === 1 ? '' : `scale(${scale})`
    this.style.height = `${Math.ceil(height * scale)}px`
    this.dataset.height = String(height)
  }

  private onMessage = (event: MessageEvent) => {
    const frame = this.querySelector('iframe')
    const message = messageFrom(event, frame)
    if (message?.type === MESSAGE.ready && this.loadedDocument === this.documentWrites) {
      this.frameReady = true
      releaseReadyPageRequests(this.pageRequests)
    }
    const page = this.pageValue
    if (message?.type === MESSAGE.slotFit && message.slots && frame === this.slotFrame?.frame && this.slotFrame.generation === this.loadGeneration)
      this.resolvedSlots?.mergeFit(message.slots)
    if (!page || message?.type !== MESSAGE.height || message.height === undefined) return
    // A fixed sheet keeps its own height whatever its content reports.
    if (typeof page.size === 'object' && page.size.height !== 'auto') return
    this.contentHeight = message.height
    this.dataset.measured = ''
    this.fit()
  }
}

export function createPageElement(): SegnaviaPage {
  if (!customElements.get(HEADLESS_ELEMENTS.page)) customElements.define(HEADLESS_ELEMENTS.page, SegnaviaPage)
  return document.createElement(HEADLESS_ELEMENTS.page) as SegnaviaPage
}
