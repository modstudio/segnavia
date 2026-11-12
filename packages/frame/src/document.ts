// <segnavia-document>: shows an ordered run of designed pages on one paper size.
// Sheets are mounted only near the viewport and never grow beyond their natural size at the browser's 96 dpi.

import {
  type Document,
  type OriginApproval,
  type Page,
  type PageWidths,
  type PreflightProfileInput,
  Print,
  type PrintInput,
  pageOrPrintedFromDocument,
  resolveBrand,
  type SlotsOptions,
} from '@segnavia/format'
import { type EstablishedPageDay, fillAsOfBindings, type HtmlPage, parseDocument, resolveDocumentDayContexts, resolvePageHtml } from '@segnavia/html'
import { captureAsOfLoad, dispatchAsof } from './as-of-element.ts'
import { ensureBaseStyle } from './base-style.ts'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import type { BrandsOptions } from './brands.ts'
import { DocumentAsOfElement } from './document-as-of-element.ts'
import { mountDocumentPage } from './document-page-mount.ts'
import { documentSheets } from './document-sheets.ts'
import { internalDocumentPagesLoad, internalDocumentPagesRead } from './document-value-load.ts'
import { dispatchElementError } from './element-error.ts'
import { upgradeProperties } from './element-properties.ts'
import { defineStylesheetPropertyAccessors } from './element-property-accessors.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'
import { projectPageOnPaper } from './paper-geometry.ts'
import type { PageOrPrintedInput } from './printed-page-document.ts'
import { mergeOwnedSlotFit } from './slot-fit-owner.ts'
import { hasSlotWork, type PreparedSlots, prepareSlotCollection, slotFillRefusal } from './slot-render.ts'
import { surfacePreflightFor } from './surface-preflight.ts'

const MOUNT_MARGIN = 600

export class SegnaviaDocument extends DocumentAsOfElement {
  static {
    defineStylesheetPropertyAccessors(SegnaviaDocument.prototype, ['origins'])
  }
  private stylesheet = ''
  private extraCsp = ''
  declare origins: Iterable<OriginApproval>
  private sourceValues: Page[] = []
  private sourceDocuments: Document[] = []
  private pageValues: HtmlPage[] = []
  private printValue: Print | null = null
  private observer: IntersectionObserver | null = null
  private pageObserver: IntersectionObserver | null = null
  private currentPage = 0
  private authoringRail: HTMLElement | null = null
  private slotOptions: SlotsOptions | undefined
  private motifOptions: MotifsOptions | undefined
  private placementOptions: PlacementsOptions | undefined
  private widthOptions: PageWidths | undefined
  private fontOptions: FontsOptions | undefined
  private brandOptions: BrandsOptions | undefined
  private brandResolution: AbortController | undefined
  private slotGeneration = 0
  private slotPreparation: AbortController | undefined
  private filledHtml: string[] | undefined
  private resolvedSlots: PreparedSlots | undefined
  private resolvedGeneration = 0
  private pageDayContexts: EstablishedPageDay[] = []
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
    this.paint()
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotOptions = value
    this.paint()
    this.dispatchEvent(new CustomEvent('segnavia-document-slots'))
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  set motifs(value: MotifsOptions | undefined) {
    this.motifOptions = value
    this.paint()
  }

  get placements(): PlacementsOptions | undefined {
    return this.placementOptions
  }

  set placements(value: PlacementsOptions | undefined) {
    this.placementOptions = value
    this.paint()
  }

  protected asOfInputsChanged(): void {
    this.paint()
  }

  get pageWidths(): PageWidths | undefined {
    return this.widthOptions
  }

  set pageWidths(value: PageWidths | undefined) {
    const parsed = parsePageWidths(value)
    if (samePageWidths(this.widthOptions, parsed)) return
    this.widthOptions = parsed
    this.paint()
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    this.paint()
  }

  get brands(): BrandsOptions | undefined {
    return this.brandOptions
  }

  set brands(value: BrandsOptions | undefined) {
    this.brandOptions = value
    this.resolveDocuments(this.sourceDocuments)
  }

  get css(): string {
    return this.stylesheet
  }

  set css(value: string) {
    this.stylesheet = value
    this.paint()
    this.changed()
  }

  get cspExtra(): string {
    return this.extraCsp
  }

  set cspExtra(value: string) {
    this.extraCsp = value
    this.paint()
  }

  get pages(): Document[] {
    return this.sourceDocuments
  }

  get currentPageIndex(): number {
    return this.currentPage
  }

  set pages(value: PageOrPrintedInput[] | undefined) {
    this.sourceDocuments = (value ?? []).map((input) => parseDocument(input))
    this.resolveDocuments(this.sourceDocuments)
    this.changed()
  }

  get print(): Print | null {
    return this.printValue
  }

  set print(value: PrintInput | null | undefined) {
    this.printValue = value == null ? null : Print.parse(value)
    this.paint()
    this.changed()
  }

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    window.addEventListener('message', this.onMessage)
    this.paint()
  }

  disconnectedCallback() {
    this.brandResolution?.abort()
    this.cancelSlotPreparation()
    window.removeEventListener('message', this.onMessage)
    this.observer?.disconnect()
    this.pageObserver?.disconnect()
    this.observer = null
  }

  load(pageInputs: PageOrPrintedInput[], printInput: PrintInput): void {
    const documents = pageInputs.map((input) => parseDocument(input))
    const print = Print.parse(printInput)
    if (documents.length === 0) throw new RangeError('There is nothing to show. Pass at least one page to clear this refusal.')
    this.sourceDocuments = documents
    this.printValue = print
    this.resolveDocuments(documents)
    this.changed()
  }

  [internalDocumentPagesLoad](sources: Page[], print?: Print): void {
    this.brandResolution?.abort()
    if (sources.length === 0) throw new RangeError('There is nothing to show. Pass at least one page to clear this refusal.')
    this.sourceValues = sources
    this.sourceDocuments = []
    this.pageValues = sources.map((page) => resolvePageHtml(page, { origins: this.origins }))
    if (print) this.printValue = print
    this.paint()
    this.changed()
  }

  [internalDocumentPagesRead](): Page[] {
    return this.sourceValues
  }
  /** Installs the optional authoring rail without making it part of the viewer entry. */
  setAuthoringRail(rail: HTMLElement | null): void {
    this.authoringRail = rail
    this.paint()
  }

  scrollToPage(index: number): void {
    this.querySelector<HTMLElement>(`.segnavia-document__item[data-page-index="${index}"]`)?.scrollIntoView({ block: 'start' })
  }

  private paint() {
    surfacePreflightFor(this).setSurface(
      this.pageValues.map((_, index) => ({ key: index, folio: String(index + 1) })),
      false,
    )
    this.cancelSlotPreparation()
    const declarations = this.pageValues.map((page) => page.slots)
    const generation = ++this.slotGeneration
    const asOfLoad = captureAsOfLoad(this)
    this.filledHtml = undefined
    this.resolvedSlots = undefined
    this.resolvedGeneration = 0
    this.pageDayContexts = []
    this.observer?.disconnect()
    this.observer = null
    this.pageObserver?.disconnect()
    this.pageObserver = null
    this.replaceChildren()
    this.style.removeProperty('--segnavia-document-paper-aspect')
    const print = this.printValue
    if (!this.isConnected || !print || this.pageValues.length === 0) return
    this.paintResolved(print)
    const controller = new AbortController()
    this.slotPreparation = controller
    const isCurrent = () => this.isConnected && !controller.signal.aborted && generation === this.slotGeneration
    void resolveDocumentDayContexts(this.sourceValues, {
      ...asOfLoad,
      slots: this.slotOptions,
      signal: controller.signal,
    })
      .then(async (contexts) => {
        if (!isCurrent()) return
        for (const day of contexts.days) dispatchAsof(this, day)
        if (this.motifOptions || this.slotOptions?.resolve) {
          this.pageDayContexts = contexts.pages
          this.paintResolved(print)
          return
        }
        const refusal = this.pageValues.map((page) => slotFillRefusal(page.scripts, page.slots, this.slotOptions)).find((error) => error !== undefined)
        if (refusal) throw refusal
        if (!declarations.some((item) => hasSlotWork(item, this.slotOptions))) {
          this.pageDayContexts = contexts.pages
          this.paintResolved(print)
          return
        }
        const resolved = await prepareSlotCollection(declarations, this.slotOptions, controller.signal)
        if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration) return
        this.resolvedSlots = resolved
        this.resolvedGeneration = generation
        this.pageDayContexts = contexts.pages.map(({ day }) => ({ day, slots: {} }))
        this.filledHtml = this.pageValues.map((page, index) => resolved.apply(fillAsOfBindings(page.html, contexts.pages[index]?.day)))
        this.paintResolved(print)
      })
      .catch((error) => {
        if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration) return
        this.filledHtml = undefined
        this.resolvedSlots = undefined
        this.resolvedGeneration = 0
        dispatchElementError(this, error)
      })
  }

  private paintResolved(print: Print) {
    if (!this.isConnected) return
    this.observer?.disconnect()
    this.pageObserver?.disconnect()
    this.replaceChildren()
    const projection = projectPageOnPaper(this.pageValues[0] as HtmlPage, print)
    this.style.setProperty('--segnavia-document-paper-aspect', String(projection.aspect))
    const layout = document.createElement('div')
    layout.className = 'segnavia-document__layout'
    if (this.authoringRail) layout.append(this.authoringRail)
    const list = document.createElement('div')
    list.className = 'segnavia-document__pages'
    const sheets = documentSheets(this.pageValues, projection.box.width, list)
    layout.append(list)
    this.append(layout)
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sheet = entry.target as HTMLElement
          if (entry.isIntersecting) this.mount(sheet)
          else sheet.replaceChildren()
        }
      },
      { rootMargin: `${MOUNT_MARGIN}px` },
    )
    for (const sheet of sheets) this.observer.observe(sheet)
    this.pageObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible) return
        const index = Number((visible.target as HTMLElement).dataset.pageIndex)
        if (index === this.currentPage) return
        this.currentPage = index
        this.dispatchEvent(new CustomEvent('segnavia-document-page', { detail: { index } }))
      },
      { threshold: [0.25, 0.5, 0.75] },
    )
    for (const item of list.querySelectorAll<HTMLElement>('.segnavia-document__item')) this.pageObserver.observe(item)
  }
  private mount(sheet: HTMLElement) {
    if (sheet.firstElementChild) return
    const index = Number(sheet.dataset.page)
    const source = this.pageValues[index]
    const context = this.pageDayContexts[index]
    const print = this.printValue
    if (!source || !context || !print) return
    const projection = projectPageOnPaper(source, print)
    mountDocumentPage(sheet, {
      context,
      page: projection.page,
      html: this.filledHtml?.[index] ?? source.html,
      resolvedSlots: this.resolvedSlots,
      motifs: this.motifOptions,
      placements: this.placementOptions,
      pageWidths: this.widthOptions,
      fonts: this.fontOptions,
      brands: this.brandOptions,
      css: this.stylesheet,
      csp: this.extraCsp,
      origins: [...this.origins],
      profile: surfacePreflightFor(this).resolvedProfile(),
      preflight: (report) => surfacePreflightFor(this).receive(index, report),
    })
  }
  private onMessage = (event: MessageEvent) => {
    if (!this.resolvedSlots || this.resolvedGeneration !== this.slotGeneration) return
    mergeOwnedSlotFit(event, this.querySelectorAll('iframe'), this.resolvedSlots)
  }
  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }
  private resolveDocuments(documents: Document[]) {
    this.brandResolution?.abort()
    const controller = new AbortController()
    this.brandResolution = controller
    const commit = (brands: Awaited<ReturnType<typeof resolveBrand>>[]) => {
      if (controller.signal.aborted || documents !== this.sourceDocuments) return
      this.sourceValues = documents.map((document, index) => pageOrPrintedFromDocument(document, brands[index]))
      this.pageValues = this.sourceValues.map((page) => resolvePageHtml(page, { origins: this.origins }))
      this.paint()
    }
    if (!documents.some((document) => document.brand !== undefined)) {
      commit(documents.map(() => undefined))
      return
    }
    this.sourceValues = []
    this.pageValues = []
    this.paint()
    void Promise.all(documents.map((document) => resolveBrand(document, this.brandOptions?.source, controller.signal)))
      .then(commit)
      .catch((error) => {
        if (controller.signal.aborted || documents !== this.sourceDocuments) return
        dispatchElementError(this, error)
      })
  }
  private changed() {
    this.dispatchEvent(new CustomEvent('segnavia-document-change'))
  }
}
