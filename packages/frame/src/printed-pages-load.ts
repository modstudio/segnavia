import type { AsOfDay, FontFailure, Page, PageWidths, PreflightEntry, PreflightProfile } from '@segnavia/format'
import { type PrintedHtmlPage, printedPageAuthorHtml, resolvePrintedPageHtml } from '@segnavia/html'
import type { LoadedLayoutScript } from './layout.ts'
import { loadLayoutScripts } from './layout.ts'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { SLIDES_READY_DEADLINE_MS } from './print-document.ts'
import { measurePrintedPageCount } from './printed-page-count.ts'
import { preparePrintedPage } from './printed-page-preparation.ts'

export interface PreparedPrintedPages {
  page: PrintedHtmlPage
  count: number
  fontCss: string
  fontFailures: FontFailure[]
  layouts: LoadedLayoutScript[]
  preflightSeed: PreflightEntry[]
}

export interface PreparePrintedPagesOptions {
  signal: AbortSignal
  motifs?: MotifsOptions
  placements?: PlacementsOptions
  widths?: PageWidths
  fonts?: FontsOptions
  css?: string
  csp?: string
  origins?: Iterable<import('@segnavia/format').OriginApproval>
  profile: PreflightProfile
  report(report: import('@segnavia/format').PreflightReport): void
  day: AsOfDay
}

export async function preparePrintedPages(source: Page, options: PreparePrintedPagesOptions): Promise<PreparedPrintedPages> {
  if (!source.printedPages || !source.print) throw new RangeError('A printed-pages viewer needs a page with printedPages and print.paper.')
  const { expanded, fonts } = await preparePrintedPage(resolvePrintedPageHtml(source), options)
  const layouts = await loadLayoutScripts(printedPageAuthorHtml(expanded.page))
  const count = await measurePrintedPageCount(
    expanded.page,
    {
      baseCss: fonts.css,
      css: options.css,
      csp: options.csp,
      origins: options.origins,
      layoutScripts: layouts,
      fontFailures: fonts.failures,
      profile: options.profile,
      preflightSeed: expanded.preflight,
      report: options.report,
    },
    Date.now() + SLIDES_READY_DEADLINE_MS,
  )
  return { page: expanded.page, count, fontCss: fonts.css, fontFailures: fonts.failures, layouts, preflightSeed: expanded.preflight }
}
