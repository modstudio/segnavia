import type { OriginApproval, Page, PageWidths, SlotsOptions } from '@segnavia/format'
import { type HtmlPage, type PrintedHtmlPage, resolvePrintedPageHtml } from '@segnavia/html'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import { loadPrintedPageDocument } from './page-document-loading.ts'
import type { FontsOptions } from './page-fonts.ts'
import { type PageFrameIdentity, samePageFrame } from './page-frame.ts'
import { prepareExpandedPage } from './page-preparation.ts'
import { fillsSlotValues } from './slot-render.ts'

export const PRINTED_SLOT_REFUSAL =
  'Cannot fill slots while showing composed papers. Remove the slots option or show a page without printedPages to clear this refusal.'
export const PRINTED_SELECTION_REFUSAL = 'Cannot read the selection from composed papers. Show a page without printedPages to clear this refusal.'
export const PRINTED_HEADING_REFUSAL = 'Cannot scroll to a heading in composed papers. Show a page without printedPages to clear this refusal.'

export interface PrintedPageFrameOptions {
  motifs?: MotifsOptions
  placements?: PlacementsOptions
  widths?: PageWidths
  fonts?: FontsOptions
  slots?: SlotsOptions
  css?: string
  csp?: string
  origins?: Iterable<OriginApproval>
  signal: AbortSignal
  loaded(document: string): void
  failed(error: unknown): void
}

export function loadPrintedPageFrame(page: Page | HtmlPage, options: PrintedPageFrameOptions): void {
  if (fillsSlotValues(page.slots, options.slots)) options.failed(new Error(PRINTED_SLOT_REFUSAL))
  const printed = resolvePrintedPageHtml(page)
  const sectionPages = printed.printedPages.sections.map((section) => ({ ...printed, html: section.html }) as HtmlPage)
  void Promise.all(
    sectionPages.map((section) => prepareExpandedPage(section, options.motifs, options.fonts, options.signal, options.placements, options.widths)),
  )
    .then((shown) => {
      const first = shown[0]
      if (!first) throw new Error('a printed page needs at least one section')
      const { html: _html, ...fields } = first.page
      const resolved: PrintedHtmlPage = {
        ...fields,
        printedPages: {
          ...printed.printedPages,
          ...first.page.printedPages,
          sections: printed.printedPages.sections.map((section, index) => ({ ...section, html: shown[index]?.page.html ?? section.html })),
        },
      }
      loadPrintedPageDocument(
        resolved,
        {
          baseCss: shown.map((entry) => entry.css).join(''),
          css: options.css,
          csp: options.csp,
          origins: options.origins,
          screen: { spread: false },
          fontFailures: shown.flatMap((entry) => entry.failures),
        },
        options.loaded,
        options.failed,
      )
    })
    .catch(options.failed)
}

export function printedPageRequestRefusal(page: Pick<HtmlPage, 'printedPages'> | null, action: 'selection' | 'heading'): Error | undefined {
  if (!page?.printedPages) return undefined
  return new Error(action === 'selection' ? PRINTED_SELECTION_REFUSAL : PRINTED_HEADING_REFUSAL)
}

export function printedPageComposeFailure(
  message: { type: string; text?: string } | null,
  expectedType: string,
  current: PageFrameIdentity,
  composed: PageFrameIdentity | undefined,
): Error | undefined {
  if (message?.type !== expectedType || typeof message.text !== 'string' || !samePageFrame(current, composed)) return undefined
  return new Error(message.text)
}
