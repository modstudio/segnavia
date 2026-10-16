// <segnavia-book>: shows one continuous book in a sandboxed frame. The frame
// fills the box its host supplies and the document scrolls inside it.

import { BookView, type BookViewInput, resolveDirection } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { frameDocument, MESSAGE, messageFrom, newNonce } from './bridge.ts'
import { bookLabel } from './labels.ts'

const HTMLElementBase = globalThis.HTMLElement ?? (class {} as typeof HTMLElement)

export function bookFrame(view: BookView): { title: string; srcdoc: string } {
  return {
    title: view.title ?? bookLabel(view.lang),
    srcdoc: frameDocument(view.html, {
      scripts: view.scripts,
      nonce: newNonce(),
      dir: resolveDirection(view.dir, view.lang, view.title ?? ''),
      lang: view.lang,
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
  static observedAttributes = ['src']
  private currentView: BookView | null = null

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    window.addEventListener('message', this.onMessage)
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.onMessage)
  }

  async attributeChangedCallback(_: string, __: string | null, src: string | null) {
    if (!src) return
    const response = await fetch(sourceUrl(src))
    if (!response.ok) throw new Error(`The book at ${src} answered ${response.status}.`)
    this.view = await response.json()
  }

  get view(): BookView | null {
    return this.currentView
  }

  set view(input: BookViewInput | unknown) {
    this.currentView = BookView.parse(input)
    this.mount()
  }

  private mount() {
    const view = this.currentView
    if (!view) return
    const rendered = bookFrame(view)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.title = rendered.title
    iframe.srcdoc = rendered.srcdoc
    this.replaceChildren(iframe)
  }

  private onMessage = (event: MessageEvent) => {
    if (messageFrom(event, this.querySelector('iframe'))?.type === MESSAGE.ready) this.dispatchEvent(new Event('ready'))
  }
}
