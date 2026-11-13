import type { FontFailure, Page, PageWidths, PreflightEntry, PreflightProfile } from '@segnavia/format'
import { fillPageAsOfBindings, type PrintedHtmlPage, printedPageAuthorHtml, resolvePrintedPageHtml } from '@segnavia/html'
import type { LoadedLayoutScript } from './layout.ts'
import { loadLayoutScripts } from './layout.ts'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import { expandPrintedFramePage } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { pageFontCss } from './page-fonts.ts'
import { measurePrintedPageCount } from './printed-page-count.ts'

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
}

export async function preparePrintedPages(source: Page, options: PreparePrintedPagesOptions): Promise<PreparedPrintedPages> {
  if (!source.printedPages || !source.print) throw new RangeError('A printed-pages viewer needs a page with printedPages and print.paper.')
  const expanded = await expandPrintedFramePage(
    resolvePrintedPageHtml(source),
    options.motifs,
    options.signal,
    options.placements,
    'screen',
    options.widths,
    undefined,
    options.profile,
  )
  expanded.page = fillPageAsOfBindings(expanded.page, undefined)
  const fonts = await pageFontCss(expanded.page, expanded.fonts, options.fonts, options.signal)
  const layouts = await loadLayoutScripts(printedPageAuthorHtml(expanded.page))
  const count = await measurePrintedPageCount(
    expanded.page,
    {
      baseCss: fonts.css,
      css: options.css,
      cspExtra: options.csp,
      origins: options.origins,
      layoutScripts: layouts,
      fontFailures: fonts.failures,
      profile: options.profile,
      preflightSeed: expanded.preflight,
      report: options.report,
    },
    Date.now() + 10_000,
  )
  return { page: expanded.page, count, fontCss: fonts.css, fontFailures: fonts.failures, layouts, preflightSeed: expanded.preflight }
}
