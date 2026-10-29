// <segnavia-page>: shows one page in a sandboxed frame. A fluid page takes
// the element's width and grows to its content's height; with `bounded`, it takes
// the element's host-sized box and scrolls inside its frame. A fixed page is
// scaled to fit the element's width; a fixed width that grows does both. It
// brings no appearance, only that geometry, which a host can override.
//
// Attributes: src (page JSON), bounded (fluid pages take their box), unstyled
// (bring no styles at all). Properties: page, bounded, css, cspExtra, slots,
// motifs, fonts. `showUrl`
// shows HTML the host serves itself, under its own headers, such as a
// single-use preview ticket; that document includes the bridge itself
// (`bridgeForHost`) to report its height. data-measured is set once the
// content has reported its height, and data-height holds it.

import { Page, type PageInput, printProperties, type SlotsOptions } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { frameDocument, MESSAGE, messageFrom, newNonce, type PageSelection, SELECTION_TEXT_LIMIT, selectionMessage } from './bridge.ts'
import { framePageMotifRefusal, type MotifsOptions, prepareShownPage, shownPageDocument } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal } from './slot-render.ts'

const PLACEHOLDER_HEIGHT = 150
export const SELECTION_REPLY_MS = 2000

export class SegnaviaPage extends HTMLElement {
  static observedAttributes = ['src', 'bounded']
  css = ''
  cspExtra = ''
  private pageValue: Page | null = null
  private contentHeight = 0
  private resize = new ResizeObserver(() => this.fit())
  private slotOptions: SlotsOptions | undefined
  private motifOptions: MotifsOptions | undefined
  private fontOptions: FontsOptions | undefined
  private loadGeneration = 0
  private slotPreparation: AbortController | undefined
  private resolvedSlots: PreparedSlots | undefined
  private slotFrame: { frame: HTMLIFrameElement; generation: number } | undefined
  private hostServed = false
  private frameReady = false
  private selectionId = 0
  private selectionRequests = new Set<(reason: Error) => void>()
  private selectionReadyRequests = new Set<() => void>()

  get bounded(): boolean {
    return this.hasAttribute('bounded')
  }

  set bounded(value: boolean) {
    this.toggleAttribute('bounded', value)
  }

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotOptions = value
    if (this.pageValue) this.load(this.pageValue)
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  set motifs(value: MotifsOptions | undefined) {
    this.motifOptions = value
    if (this.pageValue) this.load(this.pageValue)
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.fontOptions = value
    if (this.pageValue) this.load(this.pageValue)
  }

  get page(): Page | null {
    return this.pageValue
  }

  set page(value: PageInput | Page | null | undefined) {
    if (value == null) {
      this.cancelSelectionRequests()
      this.cancelSlotPreparation()
      this.loadGeneration++
      this.resolvedSlots = undefined
      this.slotFrame = undefined
      this.pageValue = null
      this.hostServed = false
      this.contentHeight = 0
      this.replaceChildren()
      this.style.removeProperty('height')
      delete this.dataset.height
      delete this.dataset.measured
      return
    }
    this.load(value)
  }

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    window.addEventListener('message', this.onMessage)
    this.resize.observe(this)
    if (this.pageValue) this.load(this.pageValue)
  }

  disconnectedCallback() {
    this.cancelSelectionRequests()
    this.cancelSlotPreparation()
    window.removeEventListener('message', this.onMessage)
    this.resize.disconnect()
  }

  async attributeChangedCallback(name: string, _: string | null, value: string | null) {
    if (name === 'bounded') {
      this.fit()
      return
    }
    if (!value) return
    const response = await fetch(new URL(value, location.href))
    if (!response.ok) throw new Error(`The page at ${value} answered ${response.status}.`)
    this.load(await response.json())
  }

  load(input: PageInput | unknown) {
    const page = Page.parse(input)
    this.cancelSelectionRequests()
    this.hostServed = false
    this.cancelSlotPreparation()
    this.resolvedSlots = undefined
    this.slotFrame = undefined
    const controller = new AbortController()
    this.slotPreparation = controller
    const generation = ++this.loadGeneration
    const iframe = this.mount(page)
    const show = (shownPage: Page, resolved?: PreparedSlots, fontCss = '') => {
      if (!this.isConnected || controller.signal.aborted || generation !== this.loadGeneration || iframe !== this.querySelector('iframe')) return
      this.resolvedSlots = resolved
      this.slotFrame = resolved ? { frame: iframe, generation } : undefined
      iframe.srcdoc = shownPageDocument(shownPage, resolved, {
        nonce: newNonce(),
        css: `${fontCss}${this.css}`,
        csp: this.cspExtra || undefined,
      })
    }
    const report = (error: unknown) => {
      if (!controller.signal.aborted && this.isConnected && generation === this.loadGeneration)
        this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
    }
    if (!this.motifOptions && !this.fontOptions && !(page.fonts ?? []).some((ref) => 'app' in ref)) {
      const motifRefusal = framePageMotifRefusal(page)
      if (motifRefusal) {
        report(motifRefusal)
        this.fit()
        return
      }
      iframe.srcdoc = frameDocument(page.html, {
        scripts: page.scripts,
        nonce: newNonce(),
        dir: page.dir,
        lang: page.lang,
        css: `${page.print ? printProperties(page.print) : ''}${this.css}`,
        csp: this.cspExtra || undefined,
        relayKeys: false,
      })
      const refusal = slotFillRefusal(page.scripts, page.slots, this.slotOptions)
      if (refusal) report(refusal)
      else if (hasSlotWork(page.slots, this.slotOptions))
        void prepareSlots(page.slots, this.slotOptions, controller.signal)
          .then((resolved) => show(page, resolved))
          .catch(report)
      this.fit()
      return
    }
    void prepareShownPage(page, this.motifOptions, this.slotOptions, this.fontOptions, controller.signal)
      .then(({ page: shownPage, resolved, css }) => show(shownPage, resolved, css))
      .catch(report)
    this.fit()
  }

  showUrl(url: string, size: Page['size'] = 'fluid') {
    this.cancelSelectionRequests()
    this.hostServed = true
    this.cancelSlotPreparation()
    this.loadGeneration++
    this.resolvedSlots = undefined
    this.slotFrame = undefined
    const iframe = this.mount(Page.parse({ html: '', size }))
    iframe.src = new URL(url, location.href).href
    this.fit()
  }

  readSelection(): Promise<PageSelection> {
    const page = this.page
    const frame = this.querySelector('iframe')
    const frameWindow = frame?.contentWindow
    if (!page || !frame || !frameWindow)
      return Promise.reject(new Error('Cannot read the selection because no page is shown or no frame is mounted. Show a page before reading its selection.'))
    if (this.hostServed)
      return Promise.reject(
        new Error('Cannot read the selection from a host-served document. Load a page whose author scripts are refused instead of using showUrl.'),
      )
    if (page.scripts !== 'refuse')
      return Promise.reject(
        new Error(
          'Cannot read the selection while author scripts run. A selection is read only from a page whose author scripts are refused, because an author script could forge the reply.',
        ),
      )
    this.selectionId = (this.selectionId % Number.MAX_SAFE_INTEGER) + 1
    const id = this.selectionId
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>
      const post = () => frameWindow.postMessage({ type: MESSAGE.selectionRequest, id }, '*')
      const finish = (result: PageSelection | Error) => {
        window.removeEventListener('message', onMessage)
        clearTimeout(timer)
        this.selectionRequests.delete(replaced)
        this.selectionReadyRequests.delete(post)
        result instanceof Error ? reject(result) : resolve(result)
      }
      const replaced = (reason: Error) => finish(reason)
      const onMessage = (event: MessageEvent) => {
        const result = selectionMessage(event, frame, id)
        if (result && 'selection' in result) finish(result.selection)
        else if (result && 'oversize' in result)
          finish(new Error(`Cannot read the selection because its reply is longer than the ${SELECTION_TEXT_LIMIT}-unit limit. Shorten the page or selection.`))
      }
      window.addEventListener('message', onMessage)
      this.selectionRequests.add(replaced)
      timer = setTimeout(
        () => finish(new Error(`Cannot read the selection because the page did not send a valid reply within ${SELECTION_REPLY_MS} ms. Try again.`)),
        SELECTION_REPLY_MS,
      )
      if (this.frameReady) post()
      else this.selectionReadyRequests.add(post)
    })
  }

  private mount(page: Page): HTMLIFrameElement {
    this.frameReady = false
    this.pageValue = page
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

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }

  private cancelSelectionRequests() {
    const reason = new Error('Cannot read the selection because the page changed before it replied. Read the selection from the current page.')
    for (const cancel of [...this.selectionRequests]) cancel(reason)
  }

  private fit() {
    const page = this.page
    const sheet = this.querySelector<HTMLElement>('.segnavia-page__sheet')
    if (!page || !sheet) return
    const fluidBounded = typeof page.size !== 'object' && this.bounded
    if (fluidBounded) {
      sheet.style.height = '100%'
      sheet.style.removeProperty('transform')
      this.style.removeProperty('height')
      if (this.contentHeight) this.dataset.height = String(this.contentHeight)
      else delete this.dataset.height
      return
    }
    const width = typeof page.size === 'object' ? page.size.width : null
    const scale = width === null ? 1 : Math.min(1, this.clientWidth / width)
    const height = this.contentHeight || PLACEHOLDER_HEIGHT
    sheet.style.height = `${height}px`
    sheet.style.transform = scale === 1 ? '' : `scale(${scale})`
    this.style.height = `${Math.ceil(height * scale)}px`
    this.dataset.height = String(height)
  }

  private onMessage = (event: MessageEvent) => {
    const frame = this.querySelector('iframe')
    const message = messageFrom(event, frame)
    if (message?.type === MESSAGE.ready) {
      this.frameReady = true
      for (const post of [...this.selectionReadyRequests]) post()
      this.selectionReadyRequests.clear()
    }
    const page = this.page
    if (message?.type === MESSAGE.slotFit && message.slots && frame === this.slotFrame?.frame && this.slotFrame.generation === this.loadGeneration)
      this.resolvedSlots?.mergeFit(message.slots)
    if (!page || message?.type !== MESSAGE.height || message.height === undefined) return
    // A fixed sheet keeps its own height whatever its content reports.
    if (typeof page.size === 'object' && page.size.height !== 'auto') return
    this.contentHeight = message.height
    this.dataset.measured = ''
    this.fit()
  }
}
