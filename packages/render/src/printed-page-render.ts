import { diagramScript } from '@segnavia/diagrams'
import { newNonce } from '@segnavia/frame/bridge'
import { PRINTED_PAGE_COMPOSED_ATTRIBUTE, PRINTED_PAGE_FAILURE_ATTRIBUTE, printedPageDocument } from '@segnavia/frame/printed-page-document'
import type { HtmlPage } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import type { RenderOptions } from './options.ts'
import { renderPageDocument } from './page-document.ts'
import { RENDER_READY_BINDING } from './render-readiness.ts'

export function renderedPageDocument(page: HtmlPage, options: RenderOptions, printing = false): string {
  if (!page.printedPages) return renderPageDocument(page, options, printing)
  return printedPageDocument(page, {
    nonce: newNonce(),
    css: `${fontFaces(options.fonts)}${options.css ?? ''}`,
    diagramScript,
    readyCallback: RENDER_READY_BINDING,
  })
}

export async function awaitPrintedPageComposition(tab: Tab, page: HtmlPage): Promise<void> {
  if (!page.printedPages) return
  await tab.waitForFunction(({ composed, failed }) => document.documentElement.hasAttribute(composed) || document.documentElement.hasAttribute(failed), {
    composed: PRINTED_PAGE_COMPOSED_ATTRIBUTE,
    failed: PRINTED_PAGE_FAILURE_ATTRIBUTE,
  })
  const failure = await tab.evaluate((attribute) => document.documentElement.getAttribute(attribute), PRINTED_PAGE_FAILURE_ATTRIBUTE)
  if (failure) throw new RenderRefusedError(`The printed-page composer failed: ${failure}`)
}
