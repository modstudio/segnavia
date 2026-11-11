import { type AsOfDay, type Page, type PageWidths, type PreflightProfileInput, pageDirection, printProperties, type SlotsOptions } from '@segnavia/format'
import { type HtmlPage, resolvePageHtml, slotsWithDay } from '@segnavia/html'
import { frameStyleSheets } from './bridge.ts'
import { framePageMotifRefusal, type MotifsOptions, type PlacementsOptions } from './motif-expansion.ts'
import { loadPageDocument } from './page-document-loading.ts'
import type { FontsOptions } from './page-fonts.ts'
import type { PageFrameIdentity } from './page-frame.ts'
import { prepareShownPage, slotsForShownPage } from './page-preparation.ts'
import { loadPrintedPageFrame } from './page-printed.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal } from './slot-render.ts'

export interface PageValueRenderOptions {
  motifs?: MotifsOptions
  placements?: PlacementsOptions
  widths?: PageWidths
  fonts?: FontsOptions
  css: string
  csp?: string
  origins: Iterable<import('@segnavia/format').OriginApproval>
  profile?: PreflightProfileInput
}

export interface PageValueRenderHandlers {
  show(page: HtmlPage, resolved?: PreparedSlots, fontCss?: string, fontFailures?: import('@segnavia/format').FontFailure[]): void
  report(error: unknown): void
  write(document: string, provisional?: boolean): void
  composed(identity: PageFrameIdentity): void
  fit(): void
}

export function renderPageValue(
  page: Page,
  day: AsOfDay,
  slots: SlotsOptions,
  signal: AbortSignal,
  identity: PageFrameIdentity,
  options: PageValueRenderOptions,
  handlers: PageValueRenderHandlers,
): void {
  if (page.printedPages) {
    let effectiveSlots: SlotsOptions
    try {
      effectiveSlots = slotsWithDay(slots, day, slots.source)
    } catch (error) {
      handlers.report(error)
      handlers.fit()
      return
    }
    handlers.composed(identity)
    loadPrintedPageFrame(page, { ...options, slots: effectiveSlots, day, signal, loaded: handlers.write, failed: handlers.report })
    handlers.fit()
    return
  }
  const resolvedPage = resolvePageHtml(page)
  if (!options.motifs && !options.fonts && !options.placements && Object.keys(page.style?.fonts ?? {}).length === 0) {
    let effectiveSlots: SlotsOptions
    try {
      effectiveSlots = slotsForShownPage(resolvedPage, slots, day) ?? {}
    } catch (error) {
      handlers.report(error)
      handlers.fit()
      return
    }
    const motifRefusal = framePageMotifRefusal(resolvedPage)
    if (motifRefusal) {
      handlers.report(motifRefusal)
      handlers.fit()
      return
    }
    let sheets: string[]
    try {
      sheets = frameStyleSheets(page.style, page.brand, page.print ? printProperties(page.print) : '')
    } catch (error) {
      handlers.report(error)
      handlers.fit()
      return
    }
    const provisional = hasSlotWork(resolvedPage.slots, effectiveSlots)
    loadPageDocument(
      resolvedPage,
      {
        scripts: page.scripts,
        dir: pageDirection(resolvedPage),
        lang: page.lang,
        sheets,
        css: options.css,
        csp: options.csp,
        origins: options.origins,
        relayKeys: false,
      },
      (document) => handlers.write(document, provisional),
      handlers.report,
    )
    const refusal = slotFillRefusal(resolvedPage.scripts, resolvedPage.slots, effectiveSlots)
    if (refusal) handlers.report(refusal)
    else if (provisional) {
      void prepareSlots(resolvedPage.slots, effectiveSlots, signal)
        .then((resolved) => handlers.show(resolvedPage, resolved))
        .catch(handlers.report)
    }
    handlers.fit()
    return
  }
  void prepareShownPage(resolvedPage, options.motifs, slots, options.fonts, signal, options.placements, options.widths, day)
    .then(({ page: shownPage, resolved, css, failures }) => handlers.show(shownPage, resolved, css, failures))
    .catch(handlers.report)
}
