// <segnavia-paper>: shows one paper of an imposition, scaled to the element's
// width. It brings no appearance, only geometry, which a host can override.

import {
  type Document,
  Imposition,
  type ImpositionInput,
  impose,
  type Page,
  type PageWidths,
  pageOrPrintedFromDocument,
  resolveBrand,
  type SlotsOptions,
} from '@segnavia/format'
import { type HtmlPage, parseDocument, resolvePageHtml } from '@segnavia/html'
import { ensureBaseStyle } from './base-style.ts'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import type { BrandsOptions } from './brands.ts'
import { dispatchFontFailures, messageFrom } from './bridge.ts'
import { internalPaperPagesLoad } from './document-value-load.ts'
import { upgradeProperties } from './element-properties.ts'
import { defineStylesheetPropertyAccessors } from './element-property-accessors.ts'
import { expandFramePages, framePageMotifRefusal, type MotifsOptions } from './motif-expansion.ts'
import { expandedPagesFontCss, type FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'
import { clampPaper, paperBoxSize, paperScale } from './paper-geometry.ts'
import { printablePaper } from './print-document.ts'
import type { PageOrPrintedInput } from './printed-page-document.ts'
import { mergeOwnedSlotFit } from './slot-fit-owner.ts'
import { hasSlotWork, type PreparedSlots, prepareSlotCollection, slotFillRefusal } from './slot-render.ts'

export class SegnaviaPaper extends HTMLElement {
  static observedAttributes = ['paper', 'side']
  static {
    defineStylesheetPropertyAccessors(SegnaviaPaper.prototype)
  }
  declare css: string
  declare cspExtra: string
  declare dependencyOrigins: Iterable<string>
  private pages: HtmlPage[] = []
  private brandDocuments: Document[] = []
  private imposition: Imposition | null = null
  private imposed: ReturnType<typeof impose> | null = null
  private paperIndex = 0
  private shownSide: 'front' | 'back' = 'front'
  private resize = new ResizeObserver(() => this.fit())
  private slotOptions: SlotsOptions | undefined
  private motifOptions: MotifsOptions | undefined
  private placementOptions: PlacementsOptions | undefined
  private widthOptions: PageWidths | undefined
  private fontOptions: FontsOptions | undefined
  private brandOptions: BrandsOptions | undefined
  private brandGeneration = 0
  private resolvedBrandGeneration = -1
  private resolvedFontCss = ''
  private resolvedSlots: PreparedSlots | undefined
  private slotGeneration = 0
  private resolvedGeneration = 0
  private slotPreparation: AbortController | undefined

  constructor() {
    super()
    upgradeProperties(this)
  }

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotGeneration++
    this.slotOptions = value
    if (this.imposed) this.paint()
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  set motifs(value: MotifsOptions | undefined) {
    this.slotGeneration++
    this.motifOptions = value
    if (this.imposed) this.paint()
  }

  get placements(): PlacementsOptions | undefined {
    return this.placementOptions
  }

  set placements(value: PlacementsOptions | undefined) {
    this.slotGeneration++
    this.placementOptions = value
    if (this.imposed) this.paint()
  }

  get pageWidths(): PageWidths | undefined {
    return this.widthOptions
  }

  set pageWidths(value: PageWidths | undefined) {
    const parsed = parsePageWidths(value)
    if (samePageWidths(this.widthOptions, parsed)) return
    this.slotGeneration++
    this.widthOptions = parsed
    if (this.imposed) this.paint()
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.slotGeneration++
    this.fontOptions = value
    if (this.imposed) this.paint()
  }
  get brands(): BrandsOptions | undefined {
    return this.brandOptions
  }
  set brands(value: BrandsOptions | undefined) {
    this.brandGeneration++
    this.brandOptions = value
    if (this.imposed) this.paint()
  }

  get paper(): number {
    return this.paperIndex
  }

  set paper(value: number) {
    this.showPaper(value)
  }

  get papers(): number {
    return this.imposed?.papers ?? 0
  }

  get side(): 'front' | 'back' {
    return this.shownSide
  }

  set side(value: 'front' | 'back') {
    this.showSide(value)
  }

  get sides(): 1 | 2 {
    return this.imposed?.sides ?? 1
  }

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    this.reflectState()
    window.addEventListener('message', this.onMessage)
    this.resize.observe(this)
    if (this.imposed) this.paint()
    else this.fit()
  }

  disconnectedCallback() {
    this.cancelSlotPreparation()
    window.removeEventListener('message', this.onMessage)
    this.resize.disconnect()
  }

  attributeChangedCallback(name: string, _: string | null, value: string | null) {
    if (name === 'paper') this.showPaper(Number(value ?? 0))
    else this.showSide(value === 'back' ? 'back' : 'front')
  }

  load(pageInputs: PageOrPrintedInput[], impositionInput: ImpositionInput): void {
    // Parse both inputs before changing state, so a refusal leaves the shown
    // paper untouched.
    const documents = pageInputs.map((page) => parseDocument(page))
    const pages = documents.map((page) => resolvePageHtml(pageOrPrintedFromDocument(page)))
    const imposition = Imposition.parse(impositionInput)
    this.loadValues(pages, imposition, documents)
  }

  private loadValues(pages: HtmlPage[], imposition: Imposition, brandDocuments: Document[] = []): void {
    const imposed = impose(imposition, pages.length)
    if (pages.length === 0) throw new RangeError('There is nothing to show. Pass at least one page to clear this refusal.')
    const previousPapers = this.papers
    const previousPaper = this.paperIndex
    const previousSide = this.shownSide
    this.pages = pages
    this.brandDocuments = brandDocuments
    this.brandGeneration++
    this.imposition = imposition
    this.imposed = imposed
    this.paperIndex = clampPaper(this.paperIndex, imposed.papers)
    if (imposed.sides === 1) this.shownSide = 'front'
    this.reflectState()
    this.paint()
    if (previousPapers !== this.papers || previousPaper !== this.paperIndex || previousSide !== this.shownSide) this.dispatchEvent(new Event('change'))
  }

  [internalPaperPagesLoad](pageValues: Page[], imposition: Imposition): void {
    this.loadValues(pageValues.map(resolvePageHtml), imposition)
  }

  private showPaper(value: number) {
    if (!this.imposed) {
      this.paperIndex = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0))
      return
    }
    const next = clampPaper(value, this.papers)
    const changed = next !== this.paperIndex
    this.paperIndex = next
    this.reflectState()
    if (this.imposed) this.paint()
    if (changed) this.dispatchEvent(new Event('change'))
  }

  private showSide(value: 'front' | 'back') {
    const next = value === 'back' && (!this.imposed || this.sides === 2) ? 'back' : 'front'
    const changed = next !== this.shownSide
    this.shownSide = next
    this.reflectState()
    if (this.imposed) this.paint()
    if (changed) this.dispatchEvent(new Event('change'))
  }

  private reflectState() {
    const value = String(this.paperIndex)
    if (this.getAttribute('paper') !== value) this.setAttribute('paper', value)
    if (this.getAttribute('side') !== this.shownSide) this.setAttribute('side', this.shownSide)
    this.dataset.papers = String(this.papers)
    this.dataset.sides = String(this.sides)
  }

  private paint() {
    this.cancelSlotPreparation()
    const imposition = this.imposition
    const imposed = this.imposed
    if (!imposition || !imposed) return
    const generation = ++this.slotGeneration
    this.resolvedSlots = undefined
    this.resolvedGeneration = 0
    this.resolvedFontCss = ''
    const pages = this.pages
    const controller = new AbortController()
    this.slotPreparation = controller
    const current = () =>
      this.isConnected &&
      !controller.signal.aborted &&
      generation === this.slotGeneration &&
      pages === this.pages &&
      imposition === this.imposition &&
      imposed === this.imposed
    const commit = (shown: HtmlPage[], resolved?: PreparedSlots) => {
      if (!current()) return
      this.resolvedSlots = resolved
      this.resolvedGeneration = resolved ? generation : 0
      this.paintResolved(imposition, imposed, shown)
    }
    const report = (error: unknown, showOriginal = true) => {
      if (!current()) return
      this.resolvedSlots = undefined
      this.resolvedGeneration = 0
      if (showOriginal && !this.motifOptions && !this.fontOptions) this.paintResolved(imposition, imposed)
      this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
    }
    if (this.resolvedBrandGeneration !== this.brandGeneration && this.brandDocuments.some((document) => document.brand !== undefined)) {
      const documents = this.brandDocuments
      const brandGeneration = this.brandGeneration
      void Promise.all(documents.map((document) => resolveBrand(document, this.brandOptions?.source, controller.signal)))
        .then((brands) => {
          if (!current() || brandGeneration !== this.brandGeneration || documents !== this.brandDocuments) return
          this.resolvedBrandGeneration = brandGeneration
          this.pages = pages.map((page, index) => ({ ...page, brand: brands[index] }))
          this.paint()
        })
        .catch((error) => report(error, false))
      return
    }
    const continuePaint = (shown: HtmlPage[]) => {
      const refusal = shown.map((page) => slotFillRefusal(page.scripts, page.slots, this.slotOptions)).find((error) => error !== undefined)
      if (refusal) throw refusal
      const declarations = shown.map((page) => page.slots)
      if (!declarations.some((item) => hasSlotWork(item, this.slotOptions))) {
        if (this.motifOptions || this.fontOptions) commit(shown)
        return
      }
      void prepareSlotCollection(declarations, this.slotOptions, controller.signal)
        .then((resolved) => commit(shown, resolved))
        .catch(report)
    }
    if (!this.motifOptions && !this.fontOptions && !this.placementOptions && !pages.some((page) => Object.keys(page.style?.fonts ?? {}).length > 0)) {
      const motifRefusal = pages.map(framePageMotifRefusal).find((error) => error !== undefined)
      if (motifRefusal) {
        this.paintPlaceholder(imposed)
        report(motifRefusal, false)
        return
      }
      this.paintResolved(imposition, imposed)
      try {
        continuePaint(pages)
      } catch (error) {
        report(error)
      }
      return
    }
    this.paintPlaceholder(imposed)
    void expandFramePages(pages, this.motifOptions, controller.signal, this.placementOptions, 'screen', this.widthOptions)
      .then(async (expanded) => {
        const { css } = await expandedPagesFontCss(expanded, this.fontOptions, controller.signal)
        if (!current()) return
        this.resolvedFontCss = css
        continuePaint(expanded.map((item) => item.page))
      })
      .catch(report)
  }

  private paintPlaceholder(imposed: ReturnType<typeof impose>) {
    const box = document.createElement('div')
    box.className = 'segnavia-paper__paper'
    box.dir = 'ltr'
    const paper = paperBoxSize(imposed.paper)
    box.style.width = `${paper.width}px`
    box.style.height = `${paper.height}px`
    this.style.setProperty('--segnavia-paper-aspect', `${imposed.paper.width} / ${imposed.paper.height}`)
    this.replaceChildren(box)
    this.fit()
  }

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }

  private paintResolved(imposition: Imposition, imposed: ReturnType<typeof impose>, pages = this.pages) {
    const box = document.createElement('div')
    box.className = 'segnavia-paper__paper'
    // Positions on paper are physical and therefore left to right. This box
    // writes no text; each page keeps its own direction inside its frame.
    box.dir = 'ltr'
    const paper = paperBoxSize(imposed.paper)
    box.style.width = `${paper.width}px`
    box.style.height = `${paper.height}px`
    // Author HTML occurs only in escaped srcdoc attributes produced by the
    // builder, so assigning its trusted placement markup here cannot parse it
    // as part of the host document.
    box.innerHTML = printablePaper(
      pages.map((page) => ({ ...page, html: this.resolvedSlots?.apply(page.html) ?? page.html })),
      imposition,
      imposed,
      this.paperIndex,
      {
        css: `${this.resolvedFontCss}${this.css}`,
        cspExtra: this.cspExtra,
        dependencyOrigins: this.dependencyOrigins,
        pageWidths: this.widthOptions,
      },
      this.shownSide,
    )
    this.style.setProperty('--segnavia-paper-aspect', `${imposed.paper.width} / ${imposed.paper.height}`)
    this.replaceChildren(box)
    this.fit()
  }

  private fit() {
    const box = this.querySelector<HTMLElement>('.segnavia-paper__paper')
    const imposed = this.imposed
    if (!box || !imposed) return
    const scale = paperScale(this.clientWidth, paperBoxSize(imposed.paper).width)
    box.style.transform = scale === 1 ? '' : `scale(${scale})`
  }

  private onMessage = (event: MessageEvent) => {
    const message = messageFrom(event, this.querySelectorAll('iframe'))
    dispatchFontFailures(this, message)
    if (!this.resolvedSlots || this.resolvedGeneration !== this.slotGeneration) return
    mergeOwnedSlotFit(event, this.querySelectorAll('iframe'), this.resolvedSlots)
  }
}
