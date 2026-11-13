import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { SegnaviaPrintedPages } from './printed-pages.ts'

export function createPrintedPagesElement(): SegnaviaPrintedPages {
  if (!customElements.get(HEADLESS_ELEMENTS.printedPages)) customElements.define(HEADLESS_ELEMENTS.printedPages, SegnaviaPrintedPages)
  return document.createElement(HEADLESS_ELEMENTS.printedPages) as SegnaviaPrintedPages
}
