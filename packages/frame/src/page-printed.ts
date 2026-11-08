import type { PageWidths, SlotsOptions } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { expandFramePage, type MotifsOptions, type PlacementsOptions } from './motif-expansion.ts'
import { loadPrintedPageDocument } from './page-document-loading.ts'
import { expandedPagesFontCss, type FontsOptions } from './page-fonts.ts'
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
  signal: AbortSignal
  loaded(document: string): void
  failed(error: unknown): void
}

async function preparePrintedPageScreen(page: HtmlPage, options: PrintedPageFrameOptions): Promise<{ page: HtmlPage; css: string }> {
  const expanded = await expandFramePage(page, options.motifs, options.signal, options.placements, 'screen', options.widths)
  const { css: fontCss } = await expandedPagesFontCss([expanded], options.fonts, options.signal)
  return { page: expanded.page, css: `${fontCss}${options.css ?? ''}` }
}

export function loadPrintedPageFrame(page: HtmlPage, options: PrintedPageFrameOptions): void {
  if (fillsSlotValues(page.slots, options.slots)) options.failed(new Error(PRINTED_SLOT_REFUSAL))
  void preparePrintedPageScreen(page, options)
    .then((shown) => loadPrintedPageDocument(shown.page, { css: shown.css, csp: options.csp, screen: { spread: false } }, options.loaded, options.failed))
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
