// <segnavia-book>: shows a continuous book in a sandboxed frame, or a paginated
// book as scaled pages and, with spread, direction-aware two-page spreads.

import { BookView, type BookViewInput, resolveDirection } from '@segnavia/format'
import { bookStylesheet } from '@segnavia/html'
import { ensureBaseStyle } from './base-style.ts'
import { BOOK_LAYOUTS, type BookLayout, bookPlaceKey } from './book-presentation.ts'
import { flowViewDocument, paginatedViewDocument } from './book-view-document.ts'
import { frameDocument, MESSAGE, messageFrom, newNonce } from './bridge.ts'
import { bookLabel } from './labels.ts'
import { type FontsOptions, refuseMissingFontSource, resolveFontReferences } from './page-fonts.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class {} as typeof HTMLElement)

export function bookFrame(view: BookView, css?: string, spread = false, layout: BookLayout = 'pages'): { title: string; srcdoc: string } {
  const title = view.title ?? bookLabel(view.lang)
  if (view.pagination) {
    return {
      title,
      srcdoc:
        layout === 'flow' && view.flow
          ? flowViewDocument(view, { nonce: newNonce(), fontCss: css })
          : paginatedViewDocument(view, view.pagination, { nonce: newNonce(), fontCss: css, screen: { spread } }),
    }
  }
  return {
    title,
    srcdoc: frameDocument(view.html, {
      scripts: view.scripts,
      nonce: newNonce(),
      dir: resolveDirection(view.dir, view.lang, view.title ?? ''),
      lang: view.lang,
      css: bookStylesheet(css, view.css, undefined),
      relayKeys: false,
      reportHeight: false,
    }),
  }
}

function sourceUrl(src: string): URL {
  try {
    return new URL(src)
  } catch {
    return new URL(src, location.href)
  }
}

export class SegnaviaBook extends HTMLElementBase {
  static observedAttributes = ['src', 'spread', 'layout']
  private currentView: BookView | null = null
  private currentLayout: BookLayout = 'pages'
  private requestedLayout: BookLayout = 'pages'
  private readyLayouts = new Set<BookLayout>()
  private pendingLayouts = new Set<BookLayout>()
  private places = new Map<BookLayout, string>()
  private switchPlaces = new Map<BookLayout, string | undefined>()
  private resolvedFontCss: string | undefined
  private reflectingLayout = false
  private loadGeneration = 0
  private loadController: AbortController | null = null
  private sourceLoadController: AbortController | null = null
  private latestInput: 'src' | 'view' | null = null
  private fontOptions: FontsOptions | undefined

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    window.addEventListener('message', this.onMessage)
    if (this.currentView && this.fontOptions) this.mount()
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.onMessage)
    this.readyLayouts.clear()
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
      const response = await fetch(sourceUrl(value), { signal: controller.signal })
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
    const outgoing = this.currentLayout
    this.currentLayout = layout
    if (this.sourceLoadController) return
    let frame = this.layoutFrame(layout)
    if (!frame && layout === 'flow') frame = this.mountLayoutFrame('flow')
    this.showLayoutFrame(layout)
    this.pendingLayouts.add(layout)
    this.switchPlaces.set(layout, this.places.get(outgoing))
    if (frame && this.readyLayouts.has(layout)) this.postLayout(frame, layout, this.switchPlaces.get(layout))
  }

  private reportError(reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason)
    this.dispatchEvent(new CustomEvent('error', { detail: { message } }))
  }

  private dropFrame() {
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
  }

  private mountLayoutFrame(layout: BookLayout): HTMLIFrameElement | null {
    const view = this.currentView
    if (!view?.pagination || (layout === 'flow' && !view.flow)) return null
    const frame = this.mountFrame(bookFrame(view, this.resolvedFontCss, this.spread, layout), layout)
    this.append(frame)
    this.showLayoutFrame(this.currentLayout)
    return frame
  }

  private mountFrames(view: BookView, css: string | undefined, layout: BookLayout) {
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
    const message = place === undefined ? { type: MESSAGE.bookLayout, layout } : { type: MESSAGE.bookLayout, layout, place }
    frame.contentWindow?.postMessage(message, '*')
    this.pendingLayouts.delete(layout)
    this.switchPlaces.delete(layout)
  }

  private mount() {
    const view = this.currentView
    if (!view) return
    const layout = this.showRequestedLayout(view)
    const place = view.title ? `book ${JSON.stringify(view.title)}` : 'book'
    if (!this.fontOptions) {
      try {
        refuseMissingFontSource(view.fonts ?? [], place)
      } catch (reason) {
        this.reportError(reason)
        return
      }
      this.mountFrames(view, undefined, layout)
      return
    }
    const generation = this.loadGeneration
    this.loadController?.abort()
    const controller = new AbortController()
    this.loadController = controller
    void resolveFontReferences(view.fonts ?? [], this.fontOptions, controller.signal, place)
      .then((css) => {
        if (generation !== this.loadGeneration || !this.isConnected) return
        this.mountFrames(view, css, layout)
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
    for (const frame of this.querySelectorAll<HTMLIFrameElement>('iframe')) {
      const message = messageFrom(event, frame)
      if (!message) continue
      const layout = frame.dataset.segnaviaBookLayout as BookLayout | undefined
      if (message.type === MESSAGE.bookPlace && layout) {
        const key = bookPlaceKey((message as { key?: unknown }).key)
        if (key !== undefined) this.places.set(layout, key)
        return
      }
      if (message.type !== MESSAGE.ready) return
      if (!layout) {
        this.dispatchEvent(new Event('ready'))
        return
      }
      this.readyLayouts.add(layout)
      if (this.pendingLayouts.has(layout)) this.postLayout(frame, layout, this.switchPlaces.get(layout))
      if (layout === this.currentLayout) this.dispatchEvent(new Event('ready'))
      return
    }
  }
}
