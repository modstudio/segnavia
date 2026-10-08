// <segnavia-page>: shows one page in a sandboxed frame. A fluid page takes
// the element's width and grows to its content's height; a fixed page is
// scaled to fit the element's width; a fixed width that grows does both. It
// brings no appearance, only that geometry, which a host can override.
//
// Attributes: src (page JSON), unstyled (bring no styles at all). Properties: page, css, cspExtra. `showUrl`
// shows HTML the host serves itself, under its own headers, such as a
// single-use preview ticket; that document includes the bridge itself
// (`bridgeForHost`) to report its height. data-measured is set once the
// content has reported its height, and data-height holds it.

import { Page, type PageInput } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { frameDocument, MESSAGE, messageFrom, newNonce } from './bridge.ts'

const PLACEHOLDER_HEIGHT = 150

export class SegnaviaPage extends HTMLElement {
  static observedAttributes = ['src']
  page: Page | null = null
  css = ''
  cspExtra = ''
  private contentHeight = 0
  private resize = new ResizeObserver(() => this.fit())

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    window.addEventListener('message', this.onMessage)
    this.resize.observe(this)
  }

  disconnectedCallback() {
    window.removeEventListener('message', this.onMessage)
    this.resize.disconnect()
  }

  async attributeChangedCallback(_: string, __: string | null, src: string | null) {
    if (!src) return
    const response = await fetch(new URL(src, location.href))
    if (!response.ok) throw new Error(`The page at ${src} answered ${response.status}.`)
    this.load(await response.json())
  }

  load(input: PageInput | unknown) {
    const page = Page.parse(input)
    const iframe = this.mount(page)
    iframe.srcdoc = frameDocument(page.html, {
      scripts: page.scripts,
      nonce: newNonce(),
      dir: page.dir,
      lang: page.lang,
      css: this.css,
      csp: this.cspExtra || undefined,
      relayKeys: false,
    })
    this.fit()
  }

  showUrl(url: string, size: Page['size'] = 'fluid') {
    const iframe = this.mount(Page.parse({ html: '', size }))
    iframe.src = new URL(url, location.href).href
    this.fit()
  }

  private mount(page: Page): HTMLIFrameElement {
    this.page = page
    this.contentHeight = typeof page.size === 'object' && page.size.height !== 'auto' ? page.size.height : 0
    delete this.dataset.measured
    const sheet = document.createElement('div')
    sheet.className = 'segnavia-page__sheet'
    // Laid out left to right whatever the host's direction: it is scaled from
    // its top-left corner, and the page inside keeps its own direction.
    sheet.dir = 'ltr'
    sheet.style.width = typeof page.size === 'object' ? `${page.size.width}px` : '100%'
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.title = 'Page'
    sheet.append(iframe)
    this.replaceChildren(sheet)
    return iframe
  }

  private fit() {
    const page = this.page
    const sheet = this.querySelector<HTMLElement>('.segnavia-page__sheet')
    if (!page || !sheet) return
    const width = typeof page.size === 'object' ? page.size.width : null
    const scale = width === null ? 1 : Math.min(1, this.clientWidth / width)
    const height = this.contentHeight || PLACEHOLDER_HEIGHT
    sheet.style.height = `${height}px`
    sheet.style.transform = scale === 1 ? '' : `scale(${scale})`
    this.style.height = `${Math.ceil(height * scale)}px`
    this.dataset.height = String(height)
  }

  private onMessage = (event: MessageEvent) => {
    const message = messageFrom(event, this.querySelector('iframe'))
    const page = this.page
    if (!page || message?.type !== MESSAGE.height || message.height === undefined) return
    // A fixed sheet keeps its own height whatever its content reports.
    if (typeof page.size === 'object' && page.size.height !== 'auto') return
    this.contentHeight = message.height
    this.dataset.measured = ''
    this.fit()
  }
}
