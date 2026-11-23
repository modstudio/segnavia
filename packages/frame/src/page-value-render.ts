import {
  type AsOfDay,
  type Page,
  type PageWidths,
  type PreflightProfileInput,
  pageDirection,
  printProperties,
  resolvePreflightProfile,
  type SlotsOptions,
} from '@segnavia/format'
import type { SoundPlacements } from '@segnavia/html'
import { type HtmlPage, resolvePageHtml, slotsWithDay } from '@segnavia/html'
import { frameStyleSheets } from './bridge.ts'
import { framePageMotifRefusal, type MotifsOptions, type PlacementsOptions } from './motif-expansion.ts'
import { loadPageDocument } from './page-document-loading.ts'
import type { FontsOptions } from './page-fonts.ts'
import type { PageFrameIdentity } from './page-frame.ts'
import { prepareShownPage, slotsForShownPage } from './page-preparation.ts'
import { loadPrintedPageFrame } from './page-printed.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal, unfilledSlots } from './slot-render.ts'

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
  show(page: HtmlPage, resolved?: PreparedSlots, fontCss?: string, fontFailures?: import('@segnavia/format').FontFailure[], sounds?: SoundPlacements): void
  report(error: unknown): void
  write(document: string, provisional: boolean, hasLayoutScripts: boolean): void
  composed(identity: PageFrameIdentity): void
  fit(): void
}

function pageHasSlotWork(page: HtmlPage, slots: SlotsOptions): boolean {
  const work = hasSlotWork(page.slots, slots)
  if (!work) unfilledSlots([...(page.slots ?? []), ...(slots.declarations ?? [])]).apply(page.html)
  return work
}

function pageHasSlotWorkOrReport(page: HtmlPage, slots: SlotsOptions, handlers: PageValueRenderHandlers): boolean | undefined {
  try {
    return pageHasSlotWork(page, slots)
  } catch (error) {
    handlers.report(error)
    handlers.fit()
  }
}

function renderUnexpandedPage(
  page: Page,
  resolvedPage: HtmlPage,
  effectiveSlots: SlotsOptions,
  signal: AbortSignal,
  options: PageValueRenderOptions,
  handlers: PageValueRenderHandlers,
): void {
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
  const provisional = pageHasSlotWorkOrReport(resolvedPage, effectiveSlots, handlers)
  if (provisional === undefined) return
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
      preflight: resolvePreflightProfile(options.profile),
    },
    (document, hasLayoutScripts) => handlers.write(document, provisional, hasLayoutScripts),
    handlers.report,
  )
  const refusal = slotFillRefusal(resolvedPage.scripts, resolvedPage.slots, effectiveSlots)
  if (refusal) handlers.report(refusal)
  else if (provisional)
    void prepareSlots(resolvedPage.slots, effectiveSlots, signal)
      .then((resolved) => handlers.show(resolvedPage, resolved))
      .catch(handlers.report)
  handlers.fit()
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
    loadPrintedPageFrame(page, {
      ...options,
      slots: effectiveSlots,
      day,
      signal,
      loaded: (document, hasLayoutScripts) => handlers.write(document, false, hasLayoutScripts),
      failed: handlers.report,
    })
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
    renderUnexpandedPage(page, resolvedPage, effectiveSlots, signal, options, handlers)
    return
  }
  void prepareShownPage(resolvedPage, options.motifs, slots, options.fonts, signal, options.placements, options.widths, day)
    .then(({ page: shownPage, resolved, css, failures, sounds }) => handlers.show(shownPage, resolved, css, failures, sounds))
    .catch(handlers.report)
}
