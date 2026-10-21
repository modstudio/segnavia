// <segnavia-document>: shows an ordered run of designed pages on one paper
// size. Sheets are mounted only near the viewport and never grow beyond their
// natural size at the browser's 96 dpi.

import { Page, type PageInput, Print, type PrintInput } from '@segnavia/format'
import { ensureBaseStyle } from './base-style.ts'
import { SegnaviaPage } from './page.ts'
import { projectPageOnPaper } from './paper-geometry.ts'

const MOUNT_MARGIN = 600

export class SegnaviaDocument extends HTMLElement {
  private stylesheet = ''
  private extraCsp = ''
  private pageValues: Page[] = []
  private printValue: Print | null = null
  private observer: IntersectionObserver | null = null

  get css(): string {
    return this.stylesheet
  }

  set css(value: string) {
    this.stylesheet = value
    this.paint()
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
  }

  get print(): Print | null {
    return this.printValue
  }

  set print(value: PrintInput | null | undefined) {
    this.printValue = value == null ? null : Print.parse(value)
    this.paint()
  }

  connectedCallback() {
    if (!this.hasAttribute('unstyled')) ensureBaseStyle(this)
    this.paint()
  }

  disconnectedCallback() {
    this.observer?.disconnect()
    this.observer = null
  }

  load(pageInputs: PageInput[], printInput: PrintInput): void {
    const pages = pageInputs.map((page) => Page.parse(page))
    const print = Print.parse(printInput)
    if (pages.length === 0) throw new RangeError('There is nothing to show. Pass at least one page to clear this refusal.')
    this.pageValues = pages
    this.printValue = print
    this.paint()
  }

  private paint() {
    this.observer?.disconnect()
    this.observer = null
    this.replaceChildren()
    this.style.removeProperty('--segnavia-document-paper-aspect')
    const print = this.printValue
    if (!this.isConnected || !print || this.pageValues.length === 0) return
    const projection = projectPageOnPaper(this.pageValues[0] as Page, print)
    this.style.setProperty('--segnavia-document-paper-aspect', String(projection.aspect))
    const list = document.createElement('div')
    list.className = 'segnavia-document__pages'
    const sheets = this.pageValues.map((_, index) => {
      const item = document.createElement('div')
      item.className = 'segnavia-document__item'
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
    this.append(list)
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
    page.load(projection.page)
  }
}
