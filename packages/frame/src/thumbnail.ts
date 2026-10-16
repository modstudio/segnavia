import { Deck } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { type ControllerOptions, DeckController } from './controller.ts'
import { isCurrentThumbnailResolution, thumbnailCanvas, thumbnailScale } from './thumbnail-canvas.ts'

export class SegnaviaThumbnail extends HTMLElement {
  private margin = 400
  private value: Deck | null = null
  private slideIndex = 0
  private slideResolver: ControllerOptions['resolveSlide']
  private baseUrl: string | undefined
  private controller: DeckController | null = null
  private observer: IntersectionObserver | null = null
  private resize = new ResizeObserver(() => this.measure())
  private near = false
  private resolution = 0
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
    if (this.value) this.style.setProperty('--segnavia-aspect', `${this.value.size.width} / ${this.value.size.height}`)
    else this.style.removeProperty('--segnavia-aspect')
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

  get base(): string | undefined {
    return this.baseUrl
  }

  set base(value: string | undefined) {
    this.baseUrl = value
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
    this.resolution++
    this.viewport.replaceChildren()
    this.controller?.destroy()
    this.controller = null
  }

  private async mount() {
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
      const canvas = thumbnailCanvas(controller, deck, slide, this.slideIndex, content)
      canvas.part.add('canvas')
      this.viewport.append(canvas)
      this.measure()
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
}
