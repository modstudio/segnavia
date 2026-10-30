// <segnavia-page>: shows one page in a sandboxed frame. A fluid page takes
// the element's width and grows to its content's height; with `bounded`, it takes
// the element's host-sized box and scrolls inside its frame. A fixed page is
// scaled to fit the element's width; a fixed width that grows does both. It
// brings no appearance, only that geometry, which a host can override.
//
// Attributes: src (page JSON), label (the frame's accessible name), bounded
// (fluid pages take their box), unstyled (bring no styles at all). Properties:
// page, label, bounded, css, cspExtra, slots, motifs, fonts. `showUrl`
// shows HTML the host serves itself, under its own headers, such as a
// single-use preview ticket; that document includes the bridge itself
// (`bridgeForHost`) to report its height. data-measured is set once the
// content has reported its height, and data-height holds it.

import { Page, type PageInput, printProperties, type SlotsOptions } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { frameDocument, frameSandbox, MESSAGE, messageFrom, newNonce, type PageSelection } from './bridge.ts'
import { framePageMotifRefusal, type MotifsOptions, prepareShownPage, shownPageDocument } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { requestSelection } from './selection-request.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal } from './slot-render.ts'

const PLACEHOLDER_HEIGHT = 150
const PAGE_CHANGED_SELECTION = 'Cannot read the selection because the page changed before it replied. Read the selection from the current page.'

type SelectionCancellation = (reason: Error) => void
type PostedSelectionRequest = { cancel?: SelectionCancellation }

export { SELECTION_REPLY_MS } from './selection-request.ts'

export class SegnaviaPage extends HTMLElement {
  static observedAttributes = ['src', 'bounded', 'label']
  css = ''
  cspExtra = ''
  dependencyOrigins: Iterable<string> = []
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
  private documentWrites = 0
  private loadedDocument: number | undefined
  private frameReady = false
  private selectionRequests = new Set<SelectionCancellation>()
  private postedSelectionRequests = new Set<PostedSelectionRequest>()
  private selectionReadyRequests = new Set<() => void>()

  get bounded(): boolean {
    return this.hasAttribute('bounded')
  }

  set bounded(value: boolean) {
    this.toggleAttribute('bounded', value)
  }

  get label(): string {
    return this.getAttribute('label') ?? ''
  }

  set label(value: string | null | undefined) {
    if (value == null || value === '') this.removeAttribute('label')
    else this.setAttribute('label', value)
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
    if (name === 'label') {
      const iframe = this.querySelector<HTMLIFrameElement>('iframe')
      if (iframe) iframe.title = value || 'Page'
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
      this.cancelPostedSelectionRequests()
      this.writeDocument(
        iframe,
        shownPageDocument(shownPage, resolved, {
          nonce: newNonce(),
          css: `${fontCss}${this.css}`,
          csp: this.cspExtra || undefined,
          dependencyOrigins: this.dependencyOrigins,
        }),
      )
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
      this.writeDocument(
        iframe,
        frameDocument(page.html, {
          scripts: page.scripts,
          nonce: newNonce(),
          dir: page.dir,
          lang: page.lang,
          css: `${page.print ? printProperties(page.print) : ''}${this.css}`,
          csp: this.cspExtra || undefined,
          dependencyOrigins: this.dependencyOrigins,
          relayKeys: false,
        }),
      )
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
    // Host-served documents do not track readiness because readSelection refuses them.
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
    const postedRequest: PostedSelectionRequest = {}
    const request = requestSelection(
      frame,
      (post) => {
        const postCurrent = () => {
          this.postedSelectionRequests.add(postedRequest)
          post()
        }
        if (this.frameReady) {
          postCurrent()
          return () => {}
        }
        this.selectionReadyRequests.add(postCurrent)
        return () => this.selectionReadyRequests.delete(postCurrent)
      },
      'page',
    )
    postedRequest.cancel = request.cancel
    this.selectionRequests.add(request.cancel)
    void request.promise.then(
      () => this.finishSelectionRequest(request.cancel),
      () => this.finishSelectionRequest(request.cancel),
    )
    return request.promise
  }

  private mount(page: Page): HTMLIFrameElement {
    this.resetDocumentReadiness()
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
    iframe.setAttribute('sandbox', frameSandbox(page.scripts))
    iframe.title = this.label || 'Page'
    sheet.append(iframe)
    this.replaceChildren(sheet)
    return iframe
  }

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }

  private cancelSelectionRequests() {
    this.cancelSelections(this.selectionRequests)
  }

  private cancelPostedSelectionRequests() {
    this.cancelSelections([...this.postedSelectionRequests].flatMap(({ cancel }) => (cancel ? [cancel] : [])))
  }

  private cancelSelections(requests: Iterable<SelectionCancellation>) {
    const reason = new Error(PAGE_CHANGED_SELECTION)
    for (const cancel of [...requests]) cancel(reason)
  }

  private finishSelectionRequest(cancel: SelectionCancellation) {
    this.selectionRequests.delete(cancel)
    for (const request of this.postedSelectionRequests) {
      if (request.cancel === cancel) this.postedSelectionRequests.delete(request)
    }
  }

  private resetDocumentReadiness() {
    this.frameReady = false
    this.loadedDocument = undefined
  }

  private writeDocument(iframe: HTMLIFrameElement, srcdoc: string) {
    const written = ++this.documentWrites
    this.resetDocumentReadiness()
    iframe.addEventListener(
      'load',
      () => {
        if (written === this.documentWrites) this.loadedDocument = written
      },
      { once: true },
    )
    iframe.srcdoc = srcdoc
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
    if (message?.type === MESSAGE.ready && this.loadedDocument === this.documentWrites) {
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
