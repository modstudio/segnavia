// <segnavia-paper>: shows one paper of an imposition, scaled to the element's
// width. It brings no appearance, only geometry, which a host can override.

import { Imposition, type ImpositionInput, impose, type Page, type PageInput, Page as PageSchema, type SlotsOptions } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { clampPaper, paperBoxSize, paperScale } from './paper-geometry.ts'
import { printablePaper } from './print-document.ts'
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
  private resolvedSlots: PreparedSlots | undefined
  private slotGeneration = 0
  private slotPreparation: AbortController | undefined

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotGeneration++
    this.slotOptions = value
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
    this.resize.observe(this)
    if (this.imposed) this.paint()
    else this.fit()
  }

  disconnectedCallback() {
    this.cancelSlotPreparation()
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

  private paint() {
    this.cancelSlotPreparation()
    const imposition = this.imposition
    const imposed = this.imposed
    if (!imposition || !imposed) return
    const declarations = this.pages.map((page) => page.slots)
    const generation = ++this.slotGeneration
    this.resolvedSlots = undefined
    const work = declarations.map((item) => hasSlotWork(item, this.slotOptions))
    if (!work.some(Boolean)) {
      this.paintResolved(imposition, imposed)
      return
    }
    const refusal = this.pages.map((page, index) => slotFillRefusal(page.scripts, work[index] ?? false)).find((error) => error !== undefined)
    if (refusal) {
      this.paintResolved(imposition, imposed)
      this.dispatchEvent(new ErrorEvent('error', { error: refusal, message: refusal.message }))
      return
    }
    const pages = this.pages
    const controller = new AbortController()
    this.slotPreparation = controller
    this.paintResolved(imposition, imposed)
    void prepareSlotCollection(declarations, this.slotOptions, controller.signal)
      .then((resolved) => {
        if (
          !this.isConnected ||
          controller.signal.aborted ||
          generation !== this.slotGeneration ||
          pages !== this.pages ||
          imposition !== this.imposition ||
          imposed !== this.imposed
        )
          return
        this.resolvedSlots = resolved
        this.paintResolved(imposition, imposed)
      })
      .catch((error) => {
        if (
          !this.isConnected ||
          controller.signal.aborted ||
          generation !== this.slotGeneration ||
          pages !== this.pages ||
          imposition !== this.imposition ||
          imposed !== this.imposed
        )
          return
        this.resolvedSlots = undefined
        this.paintResolved(imposition, imposed)
        this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
      })
  }

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }

  private paintResolved(imposition: Imposition, imposed: ReturnType<typeof impose>) {
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
      this.pages.map((page) => ({ ...page, html: this.resolvedSlots?.apply(page.html) ?? page.html })),
      imposition,
      imposed,
      this.paperIndex,
      {
        css: this.css,
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
}
