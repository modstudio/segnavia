import { type FontFailure, type OriginApproval, type PreflightProfile, pageDirection, printProperties } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { frameDocument, frameStyleSheets } from './bridge.ts'
import type { LoadedLayoutScript } from './layout.ts'
import type { PreparedSlots } from './slot-render.ts'
import { slotHtml } from './slot-render.ts'

export interface ShownPageDocumentOptions {
  baseCss?: string
  css?: string
  csp?: string
  origins?: Iterable<OriginApproval>
  fontFailures?: FontFailure[]
  preflight?: PreflightProfile
  layoutScripts?: readonly LoadedLayoutScript[]
}

export function shownPageDocument(page: HtmlPage, resolved: PreparedSlots | undefined, options: ShownPageDocumentOptions & { nonce: string }): string {
  const html = slotHtml(page.html, resolved)
  return frameDocument(html, {
    scripts: page.scripts,
    nonce: options.nonce,
    dir: pageDirection({ ...page, html }),
    lang: page.lang,
    fonts: page.style?.fonts,
    fontFailures: options.fontFailures,
    sheets: frameStyleSheets(page.style, page.brand, `${page.print ? printProperties(page.print) : ''}${options.baseCss ?? ''}`),
    css: options.css,
    csp: options.csp,
    origins: options.origins,
    preflight: options.preflight,
    relayKeys: false,
    layoutScripts: options.layoutScripts,
  })
}
