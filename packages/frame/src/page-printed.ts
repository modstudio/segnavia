import {
  type AsOfDay,
  type OriginApproval,
  type Page,
  type PageWidths,
  type PreflightProfileInput,
  resolvePreflightProfile,
  type SlotsOptions,
} from '@segnavia/format'
import { fillPageAsOfBindings, type HtmlPage, resolvePrintedPageHtml } from '@segnavia/html'
import { expandPrintedFramePage, type MotifsOptions, type PlacementsOptions } from './motif-expansion.ts'
import { loadPrintedPageDocument } from './page-document-loading.ts'
import type { FontsOptions } from './page-fonts.ts'
import { pageFontCss } from './page-fonts.ts'
import { type PageFrameIdentity, samePageFrame } from './page-frame.ts'
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
  profile?: PreflightProfileInput
  signal: AbortSignal
  day?: AsOfDay
  loaded(document: string): void
  failed(error: unknown): void
}

export function loadPrintedPageFrame(page: Page | HtmlPage, options: PrintedPageFrameOptions): void {
  if (fillsSlotValues(page.slots, options.slots)) options.failed(new Error(PRINTED_SLOT_REFUSAL))
  const printed = resolvePrintedPageHtml(page)
  void expandPrintedFramePage(printed, options.motifs, options.signal, options.placements, 'screen', options.widths, options.day)
    .then(async (expanded) => {
      expanded.page = fillPageAsOfBindings(expanded.page, options.day)
      const fonts = await pageFontCss(expanded.page, expanded.fonts, options.fonts, options.signal)
      loadPrintedPageDocument(
        expanded.page,
        {
          baseCss: fonts.css,
          css: options.css,
          csp: options.csp,
          origins: options.origins,
          screen: { spread: false },
          fontFailures: fonts.failures,
          profile: resolvePreflightProfile(options.profile),
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
