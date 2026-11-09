// <segnavia-document>: shows an ordered run of designed pages on one paper
// size. Sheets are mounted only near the viewport and never grow beyond their
// natural size at the browser's 96 dpi.

import {
  type AnchorSource,
  type Document,
  type OriginApproval,
  Page,
  type PageWidths,
  Print,
  type PrintInput,
  pageOrPrintedFromDocument,
  resolveBrand,
  type SlotsOptions,
  type Zone,
} from '@segnavia/format'
import { type HtmlPage, parseDocument, resolvePageHtml } from '@segnavia/html'
import { ensureBaseStyle } from './base-style.ts'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import type { BrandsOptions } from './brands.ts'
import { internalDocumentPagesLoad, internalDocumentPagesRead, internalPageLoad } from './document-value-load.ts'
import { upgradeProperties } from './element-properties.ts'
import { defineStylesheetPropertyAccessors } from './element-property-accessors.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import { createPageElement } from './page.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'
import { projectPageOnPaper } from './paper-geometry.ts'
import type { PageOrPrintedInput } from './printed-page-document.ts'
import { mergeOwnedSlotFit } from './slot-fit-owner.ts'
import { hasSlotWork, type PreparedSlots, prepareSlotCollection, slotFillRefusal } from './slot-render.ts'

const MOUNT_MARGIN = 600

export class SegnaviaDocument extends HTMLElement {
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
  private anchorOptions: AnchorSource | undefined
  private asOfOptions: { zone?: Zone } | undefined
  private momentValue: number | undefined
  private loadMoment = 0
  private brandOptions: BrandsOptions | undefined
  private brandResolution: AbortController | undefined
  private slotGeneration = 0
  private slotPreparation: AbortController | undefined
  private filledHtml: string[] | undefined
  private resolvedSlots: PreparedSlots | undefined
  private resolvedGeneration = 0

  constructor() {
    super()
    upgradeProperties(this)
  }

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
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

  get anchors(): AnchorSource | undefined {
    return this.anchorOptions
  }
  set anchors(value: AnchorSource | undefined) {
    this.anchorOptions = value
    this.paint()
  }
  get asOf(): { zone?: Zone } | undefined {
    return this.asOfOptions
  }
  set asOf(value: { zone?: Zone } | undefined) {
    this.asOfOptions = value
    this.paint()
  }
  get moment(): number | undefined {
    return this.momentValue
  }
  set moment(value: number | undefined) {
    if (value !== undefined && !Number.isFinite(value)) throw new RangeError('moment must be finite epoch milliseconds.')
    this.momentValue = value
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
    this.pageValues = sources.map(resolvePageHtml)
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
    this.cancelSlotPreparation()
    const declarations = this.pageValues.map((page) => page.slots)
    const generation = ++this.slotGeneration
    this.loadMoment = this.momentValue ?? Date.now()
    this.filledHtml = undefined
    this.resolvedSlots = undefined
    this.resolvedGeneration = 0
    this.observer?.disconnect()
    this.observer = null
    this.pageObserver?.disconnect()
    this.pageObserver = null
    this.replaceChildren()
    this.style.removeProperty('--segnavia-document-paper-aspect')
    const print = this.printValue
    if (!this.isConnected || !print || this.pageValues.length === 0) return
    this.paintResolved(print)
    if (this.motifOptions || this.slotOptions?.resolve) return
    const refusal = this.pageValues.map((page) => slotFillRefusal(page.scripts, page.slots, this.slotOptions)).find((error) => error !== undefined)
    if (refusal) {
      this.dispatchEvent(new ErrorEvent('error', { error: refusal, message: refusal.message }))
      return
    }
    if (!declarations.some((item) => hasSlotWork(item, this.slotOptions))) return
    const controller = new AbortController()
    this.slotPreparation = controller
    void prepareSlotCollection(declarations, this.slotOptions, controller.signal)
      .then((resolved) => {
        if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration) return
        this.resolvedSlots = resolved
        this.resolvedGeneration = generation
        this.filledHtml = this.pageValues.map((page) => resolved.apply(page.html))
        this.paintResolved(print)
      })
      .catch((error) => {
        if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration) return
        this.filledHtml = undefined
        this.resolvedSlots = undefined
        this.resolvedGeneration = 0
        this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
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
    const sheets = this.pageValues.map((_, index) => {
      const item = document.createElement('div')
      item.className = 'segnavia-document__item'
      item.dataset.pageIndex = String(index)
      const sheet = document.createElement('div')
      sheet.className = 'segnavia-document__sheet'
      sheet.dataset.page = String(index)
      sheet.style.width = `${projection.box.width}px`
      const number = document.createElement('div')
      number.className = 'segnavia-document__number'
      number.innerHTML = `Page <bdi dir="ltr">${index + 1}</bdi>`
      item.append(sheet, number)
      list.append(item)
      return sheet
    })
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
    const print = this.printValue
    if (!source || !print) return
    const projection = projectPageOnPaper(source, print)
    const page = createPageElement()
    page.motifs = this.motifOptions
    page.placements = this.placementOptions
    page.pageWidths = this.widthOptions
    page.fonts = this.fontOptions
    page.brands = this.brandOptions
    page.anchors = this.anchorOptions
    page.asOf = this.asOfOptions
    page.moment = this.loadMoment
    if (this.motifOptions || this.slotOptions?.resolve) page.slots = this.slotOptions
    page.addEventListener('asof', (event) => this.dispatchEvent(new CustomEvent('asof', { detail: (event as CustomEvent).detail })))
    page.css = this.stylesheet
    page.cspExtra = this.extraCsp
    page.origins = this.origins
    page.part.add('page')
    sheet.append(page)
    page[internalPageLoad](
      Page.parse({
        ...projection.page,
        printedPages: undefined,
        slots: this.resolvedSlots ? [] : projection.page.slots,
        html: this.filledHtml?.[index] ?? source.html,
      }),
    )
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
      this.pageValues = this.sourceValues.map(resolvePageHtml)
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
        this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
      })
  }

  private changed() {
    this.dispatchEvent(new CustomEvent('segnavia-document-change'))
  }
}
