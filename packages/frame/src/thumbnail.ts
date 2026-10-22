import { Deck, Page, type PageInput, Print, type PrintInput, type SlotsOptions } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { type ControllerOptions, DeckController } from './controller.ts'
import { SegnaviaPage } from './page.ts'
import { projectPageOnPaper } from './paper-geometry.ts'
import { mergeOwnedSlotFit } from './slot-fit-owner.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal } from './slot-render.ts'
import { isCurrentThumbnailResolution, thumbnailCanvas, thumbnailScale } from './thumbnail-canvas.ts'

export class SegnaviaThumbnail extends HTMLElement {
  private margin = 400
  private value: Deck | null = null
  private pageValue: Page | null = null
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
  private slotPreparation: AbortController | undefined
  private resolvedSlots: PreparedSlots | undefined
  private resolvedGeneration = 0
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly viewport = document.createElement('div')

  constructor() {
    super()
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

  get deck(): Deck | null {
    return this.value
  }

  set deck(input: Deck | null) {
    this.value = input === null ? null : Deck.parse(input)
    if (this.value) this.pageValue = null
    if (this.value) this.style.setProperty('--segnavia-aspect', `${this.value.size.width} / ${this.value.size.height}`)
    else this.style.removeProperty('--segnavia-aspect')
    this.changed()
  }

  get page(): Page | null {
    return this.pageValue
  }

  set page(input: PageInput | Page | null | undefined) {
    this.pageValue = input == null ? null : Page.parse(input)
    if (this.pageValue) this.value = null
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

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotOptions = value
    this.changed()
  }

  connectedCallback() {
    ensureBaseStyle(this.viewport)
    window.addEventListener('message', this.onMessage)
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
    window.removeEventListener('message', this.onMessage)
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
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
    this.resolution++
    this.resolvedSlots = undefined
    this.resolvedGeneration = 0
    this.viewport.replaceChildren()
    this.controller?.destroy()
    this.controller = null
  }

  private async mount() {
    if (this.pageValue) {
      this.mountPage()
      return
    }
    const deck = this.value
    const slide = deck?.slides[this.slideIndex]
    if (!deck || !slide || this.controller) return
    const resolution = ++this.resolution
    const controller = new DeckController({ base: this.baseUrl, resolveSlide: this.slideResolver, hash: null, persist: false })
    this.controller = controller
    try {
      await controller.load(deck, this.baseUrl)
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
        this.resolvedSlots = slots
        this.resolvedGeneration = resolution
        const filled = thumbnailCanvas(controller, deck, slide, this.slideIndex, content, this.stylesheet, false, slots)
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
    const page = new SegnaviaPage()
    page.slots = this.slotOptions
    page.css = this.stylesheet
    page.cspExtra = ''
    page.part.add('canvas')
    page.style.inlineSize = '100%'
    this.viewport.append(page)
    page.load(projection.page)
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.resolvedSlots || this.resolvedGeneration !== this.resolution) return
    mergeOwnedSlotFit(event, this.viewport.querySelectorAll('iframe'), this.resolvedSlots)
  }
}
