import type { FontFailure, PreflightEntry, PreflightProfile, PreflightReport } from '@segnavia/format'
import { newNonce, StyleSheetRefusedError } from '@segnavia/frame/bridge'
import { PRINTED_PAGE_COMPOSED_ATTRIBUTE, PRINTED_PAGE_FAILURE_ATTRIBUTE, printedPageValueDocument } from '@segnavia/frame/printed-page-document'
import { type HtmlPage, isPrintedHtmlPage, type PrintedHtmlPage } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { fontFaces } from './font-faces.ts'
import type { ComposedRenderOptions } from './options.ts'
import { renderPageValueDocument } from './page-document.ts'
import { handlePreflightAttribute, renderPreflightProfile } from './preflight.ts'
import { RENDER_READY_BINDING } from './render-readiness.ts'

export function renderedPageDocument(
  page: HtmlPage | PrintedHtmlPage,
  options: ComposedRenderOptions,
  printing = false,
  diagramScript?: string,
  fontCss = '',
  fontFailures: FontFailure[] = [],
  preflightSeed: PreflightEntry[] = [],
): string {
  try {
    if (!isPrintedHtmlPage(page) && !page.printedPages) {
      return renderPageValueDocument(page, options, printing, undefined, fontCss, diagramScript, fontFailures)
    }
    return printedPageValueDocument(page, {
      nonce: newNonce(),
      baseCss: `${fontCss}${fontFaces(options.fonts)}`,
      css: options.css,
      diagramScript,
      readyCallback: RENDER_READY_BINDING,
      limits: options.limits,
      fontFailures,
      origins: options.origins,
      profile: renderPreflightProfile(options.preflight),
      preflightSeed,
    })
  } catch (error) {
    if (error instanceof StyleSheetRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
}

export async function awaitPrintedPageComposition(
  tab: Tab,
  page: HtmlPage | PrintedHtmlPage,
  preflight?: { profile: PreflightProfile; report?: (report: PreflightReport) => void },
): Promise<void> {
  if (!page.printedPages) return
  await tab.waitForFunction(({ composed, failed }) => document.documentElement.hasAttribute(composed) || document.documentElement.hasAttribute(failed), {
    composed: PRINTED_PAGE_COMPOSED_ATTRIBUTE,
    failed: PRINTED_PAGE_FAILURE_ATTRIBUTE,
  })
  if (preflight) {
    const attribute = await tab.evaluate(() => document.documentElement.getAttribute('data-segnavia-preflight'))
    handlePreflightAttribute(attribute, preflight.profile, preflight.report)
  }
  const failure = await tab.evaluate((attribute) => document.documentElement.getAttribute(attribute), PRINTED_PAGE_FAILURE_ATTRIBUTE)
  if (failure) throw new RenderRefusedError(`The printed-page composer failed: ${failure}`)
}
