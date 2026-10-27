// <segnavia-paper>: shows one paper of an imposition, scaled to the element's
// width. It brings no appearance, only geometry, which a host can override.

import { Imposition, type ImpositionInput, impose, type Page, type PageInput, Page as PageSchema, type SlotsOptions } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { expandedPagesFontCss, expandFramePages, type FontsOptions, type MotifsOptions } from './motif-expansion.ts'
import { clampPaper, paperBoxSize, paperScale } from './paper-geometry.ts'
import { printablePaper } from './print-document.ts'
import { mergeOwnedSlotFit } from './slot-fit-owner.ts'
import { hasSlotWork, type PreparedSlots, prepareSlotCollection, slotFillRefusal } from './slot-render.ts'

export class SegnaviaPaper extends HTMLElement {
  static observedAttributes = ['paper', 'side']
  css = ''
  cspExtra = ''
  private pages: Page[] = []
  private imposition: Imposition | null = null
  private imposed: ReturnType<typeof impose> | null = null
  private paperIndex = 0
  private shownSide: 'front' | 'back' = 'front'
  private resize = new ResizeObserver(() => this.fit())
  private slotOptions: SlotsOptions | undefined
  private motifOptions: MotifsOptions | undefined
  private fontOptions: FontsOptions | undefined
  private resolvedFontCss = ''
  private resolvedSlots: PreparedSlots | undefined
  private slotGeneration = 0
  private resolvedGeneration = 0
  private slotPreparation: AbortController | undefined

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotGeneration++
    this.slotOptions = value
    if (this.imposed) this.paint()
  }

  get motifs(): MotifsOptions | undefined {
    return this.motifOptions
  }

  set motifs(value: MotifsOptions | undefined) {
    this.slotGeneration++
    this.motifOptions = value
    if (this.imposed) this.paint()
  }

  get fonts(): FontsOptions | undefined {
    return this.fontOptions
  }

  set fonts(value: FontsOptions | undefined) {
    this.slotGeneration++
    this.fontOptions = value
    if (this.imposed) this.paint()
  }

  get paper(): number {
    return this.paperIndex
  }

  set paper(value: number) {
    this.showPaper(value)
  }

  get papers(): number {
    return this.imposed?.papers ?? 0
  }

  get side(): 'front' | 'back' {
    return this.shownSide
  }

  set side(value: 'front' | 'back') {
    this.showSide(value)
  }

  get sides(): 1 | 2 {
    return this.imposed?.sides ?? 1
  }

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    this.reflectState()
    window.addEventListener('message', this.onMessage)
    this.resize.observe(this)
    if (this.imposed) this.paint()
    else this.fit()
  }

  disconnectedCallback() {
    this.cancelSlotPreparation()
    window.removeEventListener('message', this.onMessage)
    this.resize.disconnect()
  }

  attributeChangedCallback(name: string, _: string | null, value: string | null) {
    if (name === 'paper') this.showPaper(Number(value ?? 0))
    else this.showSide(value === 'back' ? 'back' : 'front')
  }

  load(pageInputs: PageInput[], impositionInput: ImpositionInput): void {
    // Parse both inputs before changing state, so a refusal leaves the shown
    // paper untouched.
    const pages = pageInputs.map((page) => PageSchema.parse(page))
    const imposition = Imposition.parse(impositionInput)
    const imposed = impose(imposition, pages.length)
    if (pages.length === 0) throw new RangeError('There is nothing to show. Pass at least one page to clear this refusal.')
    const previousPapers = this.papers
    const previousPaper = this.paperIndex
    const previousSide = this.shownSide
    this.pages = pages
    this.imposition = imposition
    this.imposed = imposed
    this.paperIndex = clampPaper(this.paperIndex, imposed.papers)
    if (imposed.sides === 1) this.shownSide = 'front'
    this.reflectState()
    this.paint()
    if (previousPapers !== this.papers || previousPaper !== this.paperIndex || previousSide !== this.shownSide) this.dispatchEvent(new Event('change'))
  }

  private showPaper(value: number) {
    if (!this.imposed) {
      this.paperIndex = Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0))
      return
    }
    const next = clampPaper(value, this.papers)
    const changed = next !== this.paperIndex
    this.paperIndex = next
    this.reflectState()
    if (this.imposed) this.paint()
    if (changed) this.dispatchEvent(new Event('change'))
  }

  private showSide(value: 'front' | 'back') {
    const next = value === 'back' && (!this.imposed || this.sides === 2) ? 'back' : 'front'
    const changed = next !== this.shownSide
    this.shownSide = next
    this.reflectState()
    if (this.imposed) this.paint()
    if (changed) this.dispatchEvent(new Event('change'))
  }

  private reflectState() {
    const value = String(this.paperIndex)
    if (this.getAttribute('paper') !== value) this.setAttribute('paper', value)
    if (this.getAttribute('side') !== this.shownSide) this.setAttribute('side', this.shownSide)
    this.dataset.papers = String(this.papers)
    this.dataset.sides = String(this.sides)
  }

  private paintCurrent(generation: number, controller: AbortController, pages: Page[], imposition: Imposition, imposed: ReturnType<typeof impose>) {
    return () =>
      this.isConnected &&
      !controller.signal.aborted &&
      generation === this.slotGeneration &&
      pages === this.pages &&
      imposition === this.imposition &&
      imposed === this.imposed
  }

  private commitPaint(shown: Page[], resolved: PreparedSlots | undefined, generation: number, imposition: Imposition, imposed: ReturnType<typeof impose>) {
    this.resolvedSlots = resolved
    this.resolvedGeneration = resolved ? generation : 0
    this.paintResolved(imposition, imposed, shown)
  }

  private reportPaint(error: unknown, imposition: Imposition, imposed: ReturnType<typeof impose>) {
    this.resolvedSlots = undefined
    this.resolvedGeneration = 0
    if (!this.motifOptions && !this.fontOptions) this.paintResolved(imposition, imposed)
    this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
  }

  private continuePaint(
    shown: Page[],
    generation: number,
    controller: AbortController,
    imposition: Imposition,
    imposed: ReturnType<typeof impose>,
    current: () => boolean,
  ) {
    const refusal = shown.map((page) => slotFillRefusal(page.scripts, page.slots, this.slotOptions)).find((error) => error !== undefined)
    if (refusal) throw refusal
    const declarations = shown.map((page) => page.slots)
    if (!declarations.some((item) => hasSlotWork(item, this.slotOptions))) {
      if (this.motifOptions || this.fontOptions) this.commitPaint(shown, undefined, generation, imposition, imposed)
      return
    }
    void prepareSlotCollection(declarations, this.slotOptions, controller.signal)
      .then((resolved) => {
        if (current()) this.commitPaint(shown, resolved, generation, imposition, imposed)
      })
      .catch((error) => {
        if (current()) this.reportPaint(error, imposition, imposed)
      })
  }

  private paint() {
    this.cancelSlotPreparation()
    const imposition = this.imposition
    const imposed = this.imposed
    if (!imposition || !imposed) return
    const generation = ++this.slotGeneration
    this.resolvedSlots = undefined
    this.resolvedGeneration = 0
    this.resolvedFontCss = ''
    const pages = this.pages
    const controller = new AbortController()
    this.slotPreparation = controller
    const current = this.paintCurrent(generation, controller, pages, imposition, imposed)
    const report = (error: unknown) => {
      if (current()) this.reportPaint(error, imposition, imposed)
    }
    if (!this.motifOptions && !this.fontOptions) {
      this.paintResolved(imposition, imposed)
      try {
        this.continuePaint(pages, generation, controller, imposition, imposed, current)
      } catch (error) {
        report(error)
      }
      return
    }
    this.paintPlaceholder(imposed)
    void expandFramePages(pages, this.motifOptions, controller.signal)
      .then(async (expanded) => {
        const css = await expandedPagesFontCss(expanded, this.fontOptions, controller.signal)
        if (!current()) return
        this.resolvedFontCss = css
        this.continuePaint(
          expanded.map((item) => item.page),
          generation,
          controller,
          imposition,
          imposed,
          current,
        )
      })
      .catch(report)
  }

  private paintPlaceholder(imposed: ReturnType<typeof impose>) {
    const box = document.createElement('div')
    box.className = 'segnavia-paper__paper'
    box.dir = 'ltr'
    const paper = paperBoxSize(imposed.paper)
    box.style.width = `${paper.width}px`
    box.style.height = `${paper.height}px`
    this.style.setProperty('--segnavia-paper-aspect', `${imposed.paper.width} / ${imposed.paper.height}`)
    this.replaceChildren(box)
    this.fit()
  }

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }

  private paintResolved(imposition: Imposition, imposed: ReturnType<typeof impose>, pages = this.pages) {
    const box = document.createElement('div')
    box.className = 'segnavia-paper__paper'
    // Positions on paper are physical and therefore left to right. This box
    // writes no text; each page keeps its own direction inside its frame.
    box.dir = 'ltr'
    const paper = paperBoxSize(imposed.paper)
    box.style.width = `${paper.width}px`
    box.style.height = `${paper.height}px`
    // Author HTML occurs only in escaped srcdoc attributes produced by the
    // builder, so assigning its trusted placement markup here cannot parse it
    // as part of the host document.
    box.innerHTML = printablePaper(
      pages.map((page) => ({ ...page, html: this.resolvedSlots?.apply(page.html) ?? page.html })),
      imposition,
      imposed,
      this.paperIndex,
      {
        css: `${this.resolvedFontCss}${this.css}`,
        cspExtra: this.cspExtra,
      },
      this.shownSide,
    )
    this.style.setProperty('--segnavia-paper-aspect', `${imposed.paper.width} / ${imposed.paper.height}`)
    this.replaceChildren(box)
    this.fit()
  }

  private fit() {
    const box = this.querySelector<HTMLElement>('.segnavia-paper__paper')
    const imposed = this.imposed
    if (!box || !imposed) return
    const scale = paperScale(this.clientWidth, paperBoxSize(imposed.paper).width)
    box.style.transform = scale === 1 ? '' : `scale(${scale})`
  }

  private onMessage = (event: MessageEvent) => {
    if (!this.resolvedSlots || this.resolvedGeneration !== this.slotGeneration) return
    mergeOwnedSlotFit(event, this.querySelectorAll('iframe'), this.resolvedSlots)
  }
}
