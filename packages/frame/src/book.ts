// <segnavia-book>: shows a continuous book in a sandboxed frame, or a paginated
// book as scaled pages and, with spread, direction-aware two-page spreads.

import { BookView, type BookViewInput, resolveDirection } from '@segnavia/format'
import { bookStylesheet } from '@segnavia/html'
import { ensureBaseStyle } from './base-style.ts'
import { paginatedViewDocument } from './book-view-document.ts'
import { frameDocument, MESSAGE, messageFrom, newNonce } from './bridge.ts'
import { bookLabel } from './labels.ts'
import { type FontsOptions, refuseMissingFontSource, resolveFontReferences } from './page-fonts.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class {} as typeof HTMLElement)

export function bookFrame(view: BookView, css?: string, spread = false): { title: string; srcdoc: string } {
  const title = view.title ?? bookLabel(view.lang)
  if (view.pagination) {
    return {
      title,
      srcdoc: paginatedViewDocument(view, view.pagination, { nonce: newNonce(), fontCss: css, screen: { spread } }),
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
  static observedAttributes = ['src', 'spread']
  private currentView: BookView | null = null
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
    ++this.loadGeneration
    this.loadController?.abort()
    this.loadController = null
    this.sourceLoadController = null
  }

  async attributeChangedCallback(name: string, previous: string | null, src: string | null) {
    if (name === 'spread') {
      if (previous === src || !this.currentView || this.sourceLoadController) return
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
    if (!src) {
      if (this.latestInput !== 'view') {
        this.latestInput = 'src'
        this.currentView = null
        this.replaceChildren()
      }
      return
    }
    this.latestInput = 'src'
    const controller = new AbortController()
    this.loadController = controller
    this.sourceLoadController = controller
    try {
      const response = await fetch(sourceUrl(src), { signal: controller.signal })
      if (!response.ok) throw new Error(`The book at ${src} answered ${response.status}.`)
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

  private reportError(reason: unknown) {
    const message = reason instanceof Error ? reason.message : String(reason)
    this.dispatchEvent(new CustomEvent('error', { detail: { message } }))
  }

  private mountFrame(rendered: { title: string; srcdoc: string }) {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.title = rendered.title
    iframe.srcdoc = rendered.srcdoc
    this.replaceChildren(iframe)
  }

  private mount() {
    const view = this.currentView
    if (!view) return
    const place = view.title ? `book ${JSON.stringify(view.title)}` : 'book'
    if (!this.fontOptions) {
      try {
        refuseMissingFontSource(view.fonts ?? [], place)
      } catch (reason) {
        this.reportError(reason)
        return
      }
      this.mountFrame(bookFrame(view, undefined, this.spread))
      return
    }
    const generation = this.loadGeneration
    this.loadController?.abort()
    const controller = new AbortController()
    this.loadController = controller
    void resolveFontReferences(view.fonts ?? [], this.fontOptions, controller.signal, place)
      .then((css) => {
        if (generation !== this.loadGeneration || !this.isConnected) return
        this.mountFrame(bookFrame(view, css, this.spread))
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
    if (messageFrom(event, this.querySelector('iframe'))?.type === MESSAGE.ready) this.dispatchEvent(new Event('ready'))
  }
}
