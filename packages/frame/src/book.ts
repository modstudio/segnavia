import { BookView, type BookViewInput } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { bookFrame, bookSourceUrl } from './book-frame.ts'
import { prepareBookView } from './book-motifs.ts'
import { BOOK_LAYOUTS, type BookLayout, bookLayoutMessage, bookPlaceKey } from './book-presentation.ts'
import { MESSAGE, messageFrom } from './bridge.ts'
import { bookViewMotifRefusal, type MotifsOptions } from './motif-expansion.ts'
import { type FontsOptions, refuseMissingFontSource, resolveFontReferences } from './page-fonts.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class {} as typeof HTMLElement)

export { bookFrame } from './book-frame.ts'

export class SegnaviaBook extends HTMLElementBase {
  static observedAttributes = ['src', 'spread', 'layout']
  private currentView: BookView | null = null
  private currentLayout: BookLayout = 'pages'
  private shownLayout: BookLayout = 'pages'
  private requestedLayout: BookLayout = 'pages'
  private readyLayouts = new Set<BookLayout>()
  private pendingLayouts = new Set<BookLayout>()
  private places = new Map<BookLayout, string>()
  private switchPlaces = new Map<BookLayout, string | undefined>()
  private layoutHandoff: { from: BookLayout; to: BookLayout; timer: ReturnType<typeof setTimeout> } | null = null
  private resolvedFontCss: string | undefined
  private reflectingLayout = false
  private loadGeneration = 0
  private loadController: AbortController | null = null
  private sourceLoadController: AbortController | null = null
  private latestInput: 'src' | 'view' | null = null
  private fontOptions: FontsOptions | undefined
  private motifOptions: MotifsOptions | undefined

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    window.addEventListener('message', this.onMessage)
    if (this.currentView && this.fontOptions) this.mount()
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.onMessage)
    this.readyLayouts.clear()
    this.cancelLayoutHandoff()
    ++this.loadGeneration
    this.loadController?.abort()
    this.loadController = null
    this.sourceLoadController = null
  }

  async attributeChangedCallback(name: string, previous: string | null, value: string | null) {
    if (name === 'layout') {
      this.changeLayout(previous, value)
      return
    }
    if (name === 'spread') {
      if (previous === value || !this.currentView || this.sourceLoadController) return
      ++this.loadGeneration
      this.loadController?.abort()
      this.loadController = null
      this.mount()
      return
    }
    const generation = ++this.loadGeneration
    this.loadController?.abort()
    this.loadController = null
    this.sourceLoadController = null
    if (!value) {
      if (this.latestInput !== 'view') {
        this.latestInput = 'src'
        this.currentView = null
        this.dropFrame()
        this.replaceChildren()
      }
      return
    }
    this.latestInput = 'src'
    const controller = new AbortController()
    this.loadController = controller
    this.sourceLoadController = controller
    try {
      const response = await fetch(bookSourceUrl(value), { signal: controller.signal })
      if (!response.ok) throw new Error(`The book at ${value} answered ${response.status}.`)
      const view = BookView.parse(await response.json())
      if (generation !== this.loadGeneration) return
      this.sourceLoadController = null
      this.currentView = view
      this.mount()
    } catch (reason) {
      if (generation !== this.loadGeneration) return
      this.reportError(reason)
    } finally {
      if (this.sourceLoadController === controller) this.sourceLoadController = null
      if (this.loadController === controller) this.loadController = null
    }
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  get spread(): boolean {
    return this.hasAttribute('spread')
  }

  set spread(value: boolean) {
    this.toggleAttribute('spread', value)
  }

  get layout(): BookLayout {
    return this.currentLayout
  }

  set layout(value: BookLayout) {
    this.setAttribute('layout', value)
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    if (!this.currentView) return
    ++this.loadGeneration
    this.loadController?.abort()
    this.loadController = null
    this.sourceLoadController = null
    this.mount()
  }

  set motifs(value: MotifsOptions | undefined) {
    this.motifOptions = value
    if (!this.currentView) return
    ++this.loadGeneration
    this.loadController?.abort()
    this.loadController = null
    this.sourceLoadController = null
    this.mount()
  }

  get view(): BookView | null {
    return this.currentView
  }

  set view(input: BookViewInput | unknown) {
    ++this.loadGeneration
    this.loadController?.abort()
    this.loadController = null
    this.sourceLoadController = null
    this.latestInput = 'view'
    const parsed = BookView.safeParse(input)
    if (!parsed.success) {
      this.reportError(parsed.error)
      return
    }
    this.currentView = parsed.data
    this.mount()
  }

  private changeLayout(previous: string | null, value: string | null) {
    if (this.reflectingLayout || previous === value) return
    const layout = value === null ? 'pages' : BOOK_LAYOUTS.find((accepted) => accepted === value)
    if (!layout) {
      const accepted = BOOK_LAYOUTS.map((held) => JSON.stringify(held)).join(' and ')
      this.reportError(new Error(`Unknown book layout ${JSON.stringify(value)}; accepted layouts are ${accepted}.`))
      this.reflectingLayout = true
      if (previous === null) this.removeAttribute('layout')
      else this.setAttribute('layout', previous)
      this.reflectingLayout = false
      return
    }
    this.requestedLayout = layout
    if (!this.currentView?.pagination) {
      this.currentLayout = layout
      return
    }
    if (layout === 'flow' && !this.currentView.flow) {
      this.reportError(new Error('This book has no flow view; supply a view built with its flow to use layout "flow".'))
      this.reflectingLayout = true
      if (previous === null) this.removeAttribute('layout')
      else this.setAttribute('layout', previous)
      this.reflectingLayout = false
      return
    }
    if (layout === this.currentLayout) return
    const previousLayout = this.currentLayout
    const outgoing = this.shownLayout
    this.currentLayout = layout
    if (this.loadController) return
    this.cancelLayoutHandoff()
    this.pendingLayouts.delete(previousLayout)
    this.switchPlaces.delete(previousLayout)
    let frame = this.layoutFrame(layout)
    if (!frame && layout === 'flow') frame = this.mountLayoutFrame('flow')
    if (layout === outgoing) {
      this.showLayoutFrame(layout)
      return
    }
    this.showLayoutFrame(outgoing)
    this.pendingLayouts.add(layout)
    this.switchPlaces.set(layout, this.places.get(outgoing))
    const outgoingFrame = this.layoutFrame(outgoing)
    if (outgoingFrame && this.readyLayouts.has(outgoing)) {
      const place = this.places.get(outgoing)
      this.layoutHandoff = {
        from: outgoing,
        to: layout,
        timer: setTimeout(() => this.finishLayoutHandoff(layout), 100),
      }
      outgoingFrame.contentWindow?.postMessage(bookLayoutMessage(layout, place), '*')
      return
    }
    this.finishLayoutHandoff(layout)
  }

  private reportError(reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason)
    this.dispatchEvent(new CustomEvent('error', { detail: { message } }))
  }

  private dropFrame() {
    this.cancelLayoutHandoff()
    this.readyLayouts.clear()
    this.pendingLayouts.clear()
    this.places.clear()
    this.switchPlaces.clear()
  }

  private showRequestedLayout(view: BookView): BookLayout {
    if (!view.pagination) return 'pages'
    if (!view.flow) {
      if (this.requestedLayout === 'flow') {
        this.reportError(new Error('This book has no flow view; supply a view built with its flow to use layout "flow".'))
      }
      if (this.currentLayout !== 'pages') {
        this.currentLayout = 'pages'
        this.reflectingLayout = true
        this.setAttribute('layout', 'pages')
        this.reflectingLayout = false
      }
      return 'pages'
    }
    const layout = this.requestedLayout
    if (layout !== this.currentLayout) {
      this.currentLayout = layout
      this.reflectingLayout = true
      this.setAttribute('layout', layout)
      this.reflectingLayout = false
    }
    return layout
  }

  private mountFrame(rendered: { title: string; srcdoc: string }, layout: BookLayout | null = null): HTMLIFrameElement {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    if (layout) iframe.dataset.segnaviaBookLayout = layout
    iframe.title = rendered.title
    iframe.srcdoc = rendered.srcdoc
    return iframe
  }

  private layoutFrame(layout: BookLayout): HTMLIFrameElement | null {
    return this.querySelector(`iframe[data-segnavia-book-layout="${layout}"]`)
  }

  private showLayoutFrame(layout: BookLayout) {
    for (const frame of this.querySelectorAll<HTMLIFrameElement>('iframe[data-segnavia-book-layout]')) {
      const shown = frame.dataset.segnaviaBookLayout === layout
      frame.hidden = !shown
      frame.style.display = shown ? 'block' : 'none'
    }
    this.shownLayout = layout
  }

  private mountLayoutFrame(layout: BookLayout): HTMLIFrameElement | null {
    const view = this.currentView
    if (!view?.pagination || (layout === 'flow' && !view.flow)) return null
    const frame = this.mountFrame(bookFrame(view, this.resolvedFontCss, this.spread, layout), layout)
    this.append(frame)
    return frame
  }

  private mountFrames(view: BookView, css: string | undefined) {
    const layout = this.currentLayout
    this.dropFrame()
    this.resolvedFontCss = css
    if (!view.pagination) {
      this.replaceChildren(this.mountFrame(bookFrame(view, css)))
      return
    }
    const pages = this.mountFrame(bookFrame(view, css, this.spread, 'pages'), 'pages')
    const frames = [pages]
    if (layout === 'flow' && view.flow) frames.push(this.mountFrame(bookFrame(view, css, this.spread, 'flow'), 'flow'))
    this.replaceChildren(...frames)
    this.showLayoutFrame(layout)
  }

  private postLayout(frame: HTMLIFrameElement, layout: BookLayout, place?: string) {
    frame.contentWindow?.postMessage(bookLayoutMessage(layout, place), '*')
    this.pendingLayouts.delete(layout)
    this.switchPlaces.delete(layout)
  }

  private cancelLayoutHandoff() {
    if (!this.layoutHandoff) return
    clearTimeout(this.layoutHandoff.timer)
    this.layoutHandoff = null
  }

  private finishLayoutHandoff(layout: BookLayout, place = this.switchPlaces.get(layout)) {
    if (layout !== this.currentLayout) return
    this.cancelLayoutHandoff()
    this.switchPlaces.set(layout, place)
    this.showLayoutFrame(layout)
    const frame = this.layoutFrame(layout)
    if (frame && this.readyLayouts.has(layout)) this.postLayout(frame, layout, place)
  }

  private mount() {
    const view = this.currentView
    if (!view) return
    this.showRequestedLayout(view)
    const place = view.title ? `book ${JSON.stringify(view.title)}` : 'book'
    try {
      if (!this.motifOptions) {
        const refusal = bookViewMotifRefusal(view)
        if (refusal) throw refusal
      }
      if (!this.motifOptions && !this.fontOptions) {
        refuseMissingFontSource(view.fonts ?? [], place)
        this.mountFrames(view, undefined)
        return
      }
    } catch (reason) {
      this.reportError(reason)
      return
    }
    const generation = this.loadGeneration
    this.loadController?.abort()
    const controller = new AbortController()
    this.loadController = controller
    const prepared = this.motifOptions
      ? prepareBookView(view, this.motifOptions, this.fontOptions, controller.signal)
      : resolveFontReferences(view.fonts ?? [], this.fontOptions as FontsOptions, controller.signal, place)
    void prepared
      .then((result) => {
        if (generation !== this.loadGeneration || !this.isConnected) return
        this.mountFrames(typeof result === 'string' ? view : result.view, typeof result === 'string' ? result : result.css)
      })
      .catch((reason) => {
        if (generation !== this.loadGeneration || !this.isConnected || controller.signal.aborted) return
        this.reportError(reason)
      })
      .finally(() => {
        if (this.loadController === controller) this.loadController = null
      })
  }

  private onMessage = (event: MessageEvent) => {
    const frames = Array.from(this.querySelectorAll<HTMLIFrameElement>('iframe'))
    const frame = frames.find((held) => messageFrom(event, held))
    if (!frame) return
    const message = messageFrom(event, frame)
    if (!message) return
    const layout = frame.dataset.segnaviaBookLayout as BookLayout | undefined
    if (message.type === MESSAGE.bookPlace && layout) {
      const key = bookPlaceKey((message as { key?: unknown }).key)
      if (key !== undefined) {
        this.places.set(layout, key)
        if (this.layoutHandoff?.from === layout) this.finishLayoutHandoff(this.layoutHandoff.to, key)
      }
      return
    }
    if (message.type !== MESSAGE.ready) return
    if (!layout) {
      this.dispatchEvent(new Event('ready'))
      return
    }
    this.readyLayouts.add(layout)
    if (this.pendingLayouts.has(layout) && this.layoutHandoff?.to !== layout) this.postLayout(frame, layout, this.switchPlaces.get(layout))
    if (layout === this.currentLayout && layout === this.shownLayout) this.dispatchEvent(new Event('ready'))
  }
}
