import type { Page, PageWidths } from '@segnavia/format'
import { frameSandbox } from './bridge.ts'
import { pageFitLayout, pagePrintedFitLayout, pageSheetLayout } from './page-layout.ts'

export interface PageFrameHeightState {
  contentHeight: number
  hasReport: boolean
  ownsElementHeight: boolean
}

function releaseElementHeight(element: HTMLElement, height: PageFrameHeightState): void {
  if (height.ownsElementHeight) element.style.removeProperty('height')
  height.ownsElementHeight = false
}

export function clearPageFrame(element: HTMLElement, height: PageFrameHeightState): void {
  element.replaceChildren()
  element.removeAttribute('data-composed-papers')
  releaseElementHeight(element, height)
  height.hasReport = false
  delete element.dataset.height
  delete element.dataset.measured
}

export function mountPageFrame(element: HTMLElement, page: Page, widths: PageWidths | undefined, label: string): HTMLIFrameElement {
  element.toggleAttribute('data-composed-papers', Boolean(page.printedPages))
  const sheet = document.createElement('div')
  sheet.className = 'segnavia-page__sheet'
  // Laid out left to right whatever the host's direction: it is scaled from
  // its top-left corner, and the page inside keeps its own direction.
  sheet.dir = 'ltr'
  if (!page.printedPages) {
    const width = pageSheetLayout(page.size, widths)
    sheet.style.inlineSize = width.inlineSize
    if (width.maxInlineSize !== undefined) sheet.style.maxInlineSize = `${width.maxInlineSize}px`
    if (width.marginInline !== undefined) sheet.style.marginInline = width.marginInline
  }
  const iframe = document.createElement('iframe')
  iframe.setAttribute('sandbox', frameSandbox(page.scripts))
  iframe.title = label || 'Page'
  sheet.append(iframe)
  element.replaceChildren(sheet)
  return iframe
}

export function fitPageFrame(element: HTMLElement, page: Page, sheet: HTMLElement, height: PageFrameHeightState, bounded: boolean): void {
  const printed = Boolean(page.printedPages)
  const fit = printed
    ? pagePrintedFitLayout(bounded, height.hasReport, height.contentHeight)
    : pageFitLayout(page.size, bounded, element.clientWidth, height.contentHeight)
  sheet.style.height = fit.sheetHeight
  sheet.style.transform = fit.transform
  if (fit.hostHeight) {
    element.style.height = fit.hostHeight
    height.ownsElementHeight = true
  } else releaseElementHeight(element, height)
  if (fit.measuredHeight === undefined) delete element.dataset.height
  else element.dataset.height = String(fit.measuredHeight)
  if (printed && fit.measuredHeight === undefined) delete element.dataset.measured
}
