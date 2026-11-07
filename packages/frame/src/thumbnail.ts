import {
  type Deck,
  Document,
  type DocumentInput,
  deckFromDocument,
  type Page,
  type PageWidths,
  Print,
  type PrintInput,
  pageFromDocument,
  type SlotsOptions,
} from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import type { AssetPlacementsOptions } from './board-policy.ts'
import { type ControllerOptions, DeckController } from './controller.ts'
import { mountDesignedCover } from './designed-cover.ts'
import { coverPresentation, type DesignedCover, type ParsedDesignedCover, parseDesignedCover } from './designed-cover-policy.ts'
import { internalThumbnailDeckLoad, internalThumbnailPageLoad, loadPageValue } from './document-value-load.ts'
import { upgradeProperties } from './element-properties.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import { createPageElement } from './page.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'
import { projectPageOnPaper } from './paper-geometry.ts'
import { hasSlotWork, prepareSlots, slotFillRefusal } from './slot-render.ts'
import { isCurrentThumbnailResolution, thumbnailCanvas, thumbnailScale } from './thumbnail-canvas.ts'
import { mountThumbnailDesignedCover, thumbnailCoverSources } from './thumbnail-designed-cover.ts'

export class SegnaviaThumbnail extends HTMLElement {
  private margin = 400
  private value: Deck | null = null
  private deckDocument: Document | null = null
  private pageValue: Page | null = null
  private pageDocument: Document | null = null
  private printValue: Print | null = null
  private slideIndex = 0
  private slideResolver: ControllerOptions['resolveSlide']
  private baseUrl: string | undefined
  private stylesheet = ''
  private controller: DeckController | null = null
  private observer: IntersectionObserver | null = null
  private resize = new ResizeObserver(() => this.measure())
  private near = false
  private resolution = 0
  private slotOptions: SlotsOptions | undefined
  private motifOptions: MotifsOptions | undefined
  private placementOptions: AssetPlacementsOptions | undefined
  private widthOptions: PageWidths | undefined
  private fontOptions: FontsOptions | undefined
  private designedCoverInput: DesignedCover | undefined
  private designedCoverValue: ParsedDesignedCover | undefined
  private designedCoverDisposal: (() => void) | undefined
  private slotPreparation: AbortController | undefined
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly viewport = document.createElement('div')

  constructor() {
    super()
    upgradeProperties(this)
    this.viewport.part.add('thumbnail')
    this.root.append(this.viewport)
  }

  get mountMargin(): number {
    return this.margin
  }

  set mountMargin(value: number) {
    this.margin = value
    if (this.isConnected) this.observe()
  }

  get deck(): Document | null {
    return this.deckDocument
  }

  set deck(input: DocumentInput | null) {
    this.deckDocument = input === null ? null : Document.parse(input)
    this.value = this.deckDocument === null ? null : deckFromDocument(this.deckDocument)
    if (this.value) this.pageValue = null
    if (this.value) this.pageDocument = null
    if (this.value) this.style.setProperty('--segnavia-aspect', `${this.value.size.width} / ${this.value.size.height}`)
    else this.style.removeProperty('--segnavia-aspect')
    this.changed()
  }

  [internalThumbnailDeckLoad](deck: Deck | null) {
    this.deckDocument = null
    this.value = deck
    if (this.value) this.pageValue = null
    if (this.value) this.pageDocument = null
    if (this.value) this.style.setProperty('--segnavia-aspect', `${this.value.size.width} / ${this.value.size.height}`)
    else this.style.removeProperty('--segnavia-aspect')
    this.changed()
  }

  get page(): Document | null {
    return this.pageDocument
  }

  set page(input: DocumentInput | null | undefined) {
    this.pageDocument = input == null ? null : Document.parse(input)
    this.pageValue = this.pageDocument === null ? null : pageFromDocument(this.pageDocument)
    if (this.pageValue) this.value = null
    if (this.pageValue) this.deckDocument = null
    this.updatePageAspect()
    this.changed()
  }

  [internalThumbnailPageLoad](page: Page | null) {
    this.pageDocument = null
    this.pageValue = page
    if (this.pageValue) this.value = null
    if (this.pageValue) this.deckDocument = null
    this.updatePageAspect()
    this.changed()
  }

  get print(): Print | null {
    return this.printValue
  }

  set print(input: PrintInput | Print | null | undefined) {
    this.printValue = input == null ? null : Print.parse(input)
    this.updatePageAspect()
    this.changed()
  }

  get index(): number {
    return this.slideIndex
  }

  set index(value: number) {
    this.slideIndex = value
    this.changed()
  }

  get resolveSlide(): ControllerOptions['resolveSlide'] {
    return this.slideResolver
  }

  set resolveSlide(value: ControllerOptions['resolveSlide']) {
    this.slideResolver = value
    this.changed()
  }

  /** The host stylesheet an HTML slide is drawn with, as the stage's `css`. */
  get css(): string {
    return this.stylesheet
  }

  set css(value: string) {
    this.stylesheet = value
    this.changed()
  }

  get base(): string | undefined {
    return this.baseUrl
  }

  set base(value: string | undefined) {
    this.baseUrl = value
    this.changed()
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  set motifs(value: MotifsOptions | undefined) {
    this.motifOptions = value
    this.changed()
  }

  get placements(): AssetPlacementsOptions | undefined {
    return this.placementOptions
  }

  set placements(value: AssetPlacementsOptions | undefined) {
    this.placementOptions = value
    this.changed()
  }

  get designedCover(): DesignedCover | undefined {
    return this.designedCoverInput
  }

  set designedCover(value: DesignedCover | undefined) {
    const parsed = value === undefined ? undefined : parseDesignedCover(value, 'The thumbnail')
    this.designedCoverInput = value
    this.designedCoverValue = parsed
    this.changed()
  }

  get pageWidths(): PageWidths | undefined {
    return this.widthOptions
  }

  set pageWidths(value: PageWidths | undefined) {
    const parsed = parsePageWidths(value)
    if (samePageWidths(this.widthOptions, parsed)) return
    this.widthOptions = parsed
    this.changed()
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    this.changed()
  }

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotOptions = value
    this.changed()
  }

  connectedCallback() {
    ensureBaseStyle(this.viewport)
    this.resize.observe(this)
    this.observe()
  }

  private observe() {
    this.observer?.disconnect()
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1)
        if (!entry) return
        this.near = entry.isIntersecting
        if (this.near) void this.mount()
        else this.clear()
      },
      { rootMargin: `${this.margin}px` },
    )
    this.observer.observe(this)
  }

  disconnectedCallback() {
    this.observer?.disconnect()
    this.observer = null
    this.resize.disconnect()
    this.near = false
    this.clear()
  }

  private changed() {
    this.clear()
    if (this.isConnected && this.near) void this.mount()
  }

  private clear() {
    this.designedCoverDisposal?.()
    this.designedCoverDisposal = undefined
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
    this.resolution++
    this.viewport.replaceChildren()
    this.controller?.destroy()
    this.controller = null
  }

  private async mount() {
    const presentation = coverPresentation(this.designedCoverValue)
    if (presentation.kind !== 'fallback') {
      const sources = thumbnailCoverSources(this.motifOptions, this.fontOptions, this.placementOptions, this.slotOptions)
      const mounted = mountThumbnailDesignedCover(this.viewport, presentation, (selected) =>
        mountDesignedCover(
          selected,
          (error) => this.dispatchEvent(new CustomEvent('segnavia-thumbnail-error', { detail: error, bubbles: true, composed: true })),
          sources.motifs,
          sources.fonts,
          sources.placements,
          sources.slots,
        ),
      )
      if (!mounted) return
      this.designedCoverDisposal = mounted.dispose
      return
    }
    if (this.pageValue) {
      this.mountPage()
      return
    }
    const deck = this.value
    const slide = deck?.slides[this.slideIndex]
    if (!deck || !slide || this.controller) return
    const resolution = ++this.resolution
    const controller = new DeckController({
      base: this.baseUrl,
      resolveSlide: this.slideResolver,
      placements: this.placementOptions,
      hash: null,
      persist: false,
    })
    this.controller = controller
    try {
      await controller.loadDeckValue(deck, this.baseUrl)
      const content = await controller.contentFor(this.slideIndex)
      if (!this.isConnected || !this.near || !isCurrentThumbnailResolution(resolution, this.resolution)) return
      const authored = thumbnailCanvas(controller, deck, slide, this.slideIndex, content, this.stylesheet)
      authored.part.add('canvas')
      this.viewport.append(authored)
      this.measure()
      const refusal = slotFillRefusal(deck.scripts, deck.slots, this.slotOptions)
      if (refusal) {
        this.dispatchEvent(new CustomEvent('segnavia-thumbnail-error', { detail: refusal, bubbles: true, composed: true }))
        return
      }
      if (!hasSlotWork(deck.slots, this.slotOptions)) return
      const slotPreparation = new AbortController()
      this.slotPreparation = slotPreparation
      try {
        const slots = await prepareSlots(deck.slots, this.slotOptions, slotPreparation.signal)
        if (!this.isConnected || slotPreparation.signal.aborted || !isCurrentThumbnailResolution(resolution, this.resolution)) return
        const filled = thumbnailCanvas(controller, deck, slide, this.slideIndex, content, this.stylesheet, slots)
        filled.part.add('canvas')
        this.viewport.replaceChildren(filled)
        this.measure()
      } catch (error) {
        if (slotPreparation.signal.aborted || !this.isConnected || !isCurrentThumbnailResolution(resolution, this.resolution)) return
        this.dispatchEvent(new CustomEvent('segnavia-thumbnail-error', { detail: error, bubbles: true, composed: true }))
      }
    } catch (error) {
      if (!isCurrentThumbnailResolution(resolution, this.resolution)) return
      this.clear()
      this.dispatchEvent(new CustomEvent('segnavia-thumbnail-error', { detail: error, bubbles: true, composed: true }))
    }
  }

  private measure() {
    const canvas = this.viewport.firstElementChild as HTMLElement | null
    if (canvas && this.value) canvas.style.transform = `scale(${thumbnailScale(this.clientWidth, this.value.size.width)})`
  }

  private updatePageAspect() {
    const print = this.printValue ?? this.pageValue?.print ?? null
    if (!this.pageValue || !print) {
      if (!this.value) this.style.removeProperty('--segnavia-aspect')
      return
    }
    const projection = projectPageOnPaper(this.pageValue, print)
    this.style.setProperty('--segnavia-aspect', String(projection.aspect))
  }

  private mountPage() {
    const source = this.pageValue
    const print = this.printValue ?? source?.print ?? null
    if (!source || !print || this.viewport.firstElementChild) return
    const projection = projectPageOnPaper(source, print)
    const page = createPageElement()
    page.motifs = this.motifOptions
    page.placements = this.placementOptions
    page.pageWidths = this.widthOptions
    page.fonts = this.fontOptions
    page.slots = this.slotOptions
    page.css = this.stylesheet
    page.cspExtra = ''
    page.part.add('canvas')
    page.style.inlineSize = '100%'
    this.viewport.append(page)
    loadPageValue(page, projection.page)
  }
}
