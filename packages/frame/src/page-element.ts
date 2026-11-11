import { HEADLESS_ELEMENTS } from './headless-elements.ts'
import { SegnaviaPage } from './page.ts'

export function createPageElement(): SegnaviaPage {
  if (!customElements.get(HEADLESS_ELEMENTS.page)) customElements.define(HEADLESS_ELEMENTS.page, SegnaviaPage)
  return document.createElement(HEADLESS_ELEMENTS.page) as SegnaviaPage
}
