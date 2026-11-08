import { pageDirection, printProperties } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import type { PreparedSlots } from './slot-render.ts'
import { slotHtml } from './slot-render.ts'

export function shownPageDocument(
  page: HtmlPage,
  resolved: PreparedSlots | undefined,
  options: { nonce: string; baseCss?: string; css?: string; csp?: string; dependencyOrigins?: Iterable<string> },
): string {
  return frameDocument(slotHtml(page.html, resolved), {
    scripts: page.scripts,
    nonce: options.nonce,
    dir: pageDirection(page),
    lang: page.lang,
    sheets: frameStyleSheets(page.style, `${page.print ? printProperties(page.print) : ''}${options.baseCss ?? ''}`),
    css: options.css,
    csp: options.csp,
    dependencyOrigins: options.dependencyOrigins,
    relayKeys: false,
  })
}
