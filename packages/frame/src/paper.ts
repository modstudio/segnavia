// <segnavia-paper>: shows one paper of an imposition, scaled to the element's
// width. It brings no appearance, only geometry, which a host can override.

import { Imposition, type ImpositionInput, impose, type Page, type PageInput, Page as PageSchema } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { clampPaper, paperBoxSize, paperScale } from './paper-geometry.ts'
import { printablePaper } from './print-document.ts'

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
    this.fit()
  }

  disconnectedCallback() {
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
    const next = value === 'back' && this.sides === 2 ? 'back' : 'front'
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
    const imposition = this.imposition
    const imposed = this.imposed
    if (!imposition || !imposed) return
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
      this.pages,
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
