// <segnavia-document>: shows an ordered run of designed pages on one paper
// size. Sheets are mounted only near the viewport and never grow beyond their
// natural size at the browser's 96 dpi.

import { Page, type PageInput, Print, type PrintInput, type SlotsOptions } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { SegnaviaPage } from './page.ts'
import { projectPageOnPaper } from './paper-geometry.ts'
import { hasSlotWork, prepareSlotCollection } from './slot-render.ts'

const MOUNT_MARGIN = 600

export class SegnaviaDocument extends HTMLElement {
  private stylesheet = ''
  private extraCsp = ''
  private pageValues: Page[] = []
  private printValue: Print | null = null
  private observer: IntersectionObserver | null = null
  private pageObserver: IntersectionObserver | null = null
  private currentPage = 0
  private authoringRail: HTMLElement | null = null
  private slotOptions: SlotsOptions | undefined
  private slotGeneration = 0
  private slotPreparation: AbortController | undefined
  private filledHtml: string[] | undefined

  get slots(): SlotsOptions | undefined {
    return this.slotOptions
  }

  set slots(value: SlotsOptions | undefined) {
    this.slotOptions = value
    this.paint()
  }

  get css(): string {
    return this.stylesheet
  }

  set css(value: string) {
    this.stylesheet = value
    this.paint()
    this.changed()
  }

  get cspExtra(): string {
    return this.extraCsp
  }

  set cspExtra(value: string) {
    this.extraCsp = value
    this.paint()
  }

  get pages(): Page[] {
    return this.pageValues
  }

  set pages(value: PageInput[] | undefined) {
    this.pageValues = (value ?? []).map((page) => Page.parse(page))
    this.paint()
    this.changed()
  }

  get print(): Print | null {
    return this.printValue
  }

  set print(value: PrintInput | null | undefined) {
    this.printValue = value == null ? null : Print.parse(value)
    this.paint()
    this.changed()
  }

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    this.paint()
  }

  disconnectedCallback() {
    this.cancelSlotPreparation()
    this.observer?.disconnect()
    this.pageObserver?.disconnect()
    this.observer = null
  }

  load(pageInputs: PageInput[], printInput: PrintInput): void {
    const pages = pageInputs.map((page) => Page.parse(page))
    const print = Print.parse(printInput)
    if (pages.length === 0) throw new RangeError('There is nothing to show. Pass at least one page to clear this refusal.')
    this.pageValues = pages
    this.printValue = print
    this.paint()
    this.changed()
  }

  /** Installs the optional authoring rail without making it part of the viewer entry. */
  setAuthoringRail(rail: HTMLElement | null): void {
    this.authoringRail = rail
    this.paint()
  }

  scrollToPage(index: number): void {
    this.querySelector<HTMLElement>(`.segnavia-document__item[data-page-index="${index}"]`)?.scrollIntoView({ block: 'start' })
  }

  private paint() {
    this.cancelSlotPreparation()
    const declarations = this.pageValues.map((page) => page.slots)
    const generation = ++this.slotGeneration
    this.filledHtml = undefined
    this.observer?.disconnect()
    this.observer = null
    this.pageObserver?.disconnect()
    this.pageObserver = null
    this.replaceChildren()
    this.style.removeProperty('--segnavia-document-paper-aspect')
    const print = this.printValue
    if (!this.isConnected || !print || this.pageValues.length === 0) return
    this.paintResolved(print)
    if (!declarations.some((item) => hasSlotWork(item, this.slotOptions))) {
      return
    }
    const controller = new AbortController()
    this.slotPreparation = controller
    void prepareSlotCollection(declarations, this.slotOptions, controller.signal)
      .then((resolved) => {
        if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration) return
        this.filledHtml = this.pageValues.map((page) => resolved.apply(page.html))
        this.paintResolved(print)
      })
      .catch((error) => {
        if (!this.isConnected || controller.signal.aborted || generation !== this.slotGeneration) return
        this.filledHtml = undefined
        this.dispatchEvent(new ErrorEvent('error', { error, message: error instanceof Error ? error.message : String(error) }))
      })
  }

  private paintResolved(print: Print) {
    if (!this.isConnected) return
    this.observer?.disconnect()
    this.pageObserver?.disconnect()
    this.replaceChildren()
    const projection = projectPageOnPaper(this.pageValues[0] as Page, print)
    this.style.setProperty('--segnavia-document-paper-aspect', String(projection.aspect))
    const layout = document.createElement('div')
    layout.className = 'segnavia-document__layout'
    if (this.authoringRail) layout.append(this.authoringRail)
    const list = document.createElement('div')
    list.className = 'segnavia-document__pages'
    const sheets = this.pageValues.map((_, index) => {
      const item = document.createElement('div')
      item.className = 'segnavia-document__item'
      item.dataset.pageIndex = String(index)
      const sheet = document.createElement('div')
      sheet.className = 'segnavia-document__sheet'
      sheet.dataset.page = String(index)
      sheet.style.width = `${projection.box.width}px`
      const number = document.createElement('div')
      number.className = 'segnavia-document__number'
      number.innerHTML = `Page <bdi dir="ltr">${index + 1}</bdi>`
      item.append(sheet, number)
      list.append(item)
      return sheet
    })
    layout.append(list)
    this.append(layout)
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sheet = entry.target as HTMLElement
          if (entry.isIntersecting) this.mount(sheet)
          else sheet.replaceChildren()
        }
      },
      { rootMargin: `${MOUNT_MARGIN}px` },
    )
    for (const sheet of sheets) this.observer.observe(sheet)
    this.pageObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible) return
        const index = Number((visible.target as HTMLElement).dataset.pageIndex)
        if (index === this.currentPage) return
        this.currentPage = index
        this.dispatchEvent(new CustomEvent('segnavia-document-page', { detail: { index } }))
      },
      { threshold: [0.25, 0.5, 0.75] },
    )
    for (const item of list.querySelectorAll<HTMLElement>('.segnavia-document__item')) this.pageObserver.observe(item)
  }

  private mount(sheet: HTMLElement) {
    if (sheet.firstElementChild) return
    const index = Number(sheet.dataset.page)
    const source = this.pageValues[index]
    const print = this.printValue
    if (!source || !print) return
    const projection = projectPageOnPaper(source, print)
    const page = new SegnaviaPage()
    page.css = this.stylesheet
    page.cspExtra = this.extraCsp
    page.part.add('page')
    sheet.append(page)
    page.load({ ...projection.page, html: this.filledHtml?.[index] ?? projection.page.html })
  }

  private cancelSlotPreparation() {
    this.slotPreparation?.abort()
    this.slotPreparation = undefined
  }

  private changed() {
    this.dispatchEvent(new CustomEvent('segnavia-document-change'))
  }
}
