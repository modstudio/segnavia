import type { FontFailure, PageWidths, SlotsOptions } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { type ExpandedFramePage, expandFramePage, type MotifsOptions, type PlacementsOptions } from './motif-expansion.ts'
import { type FontsOptions, pageFontCss } from './page-fonts.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal } from './slot-render.ts'

export async function prepareExpandedPage(
  page: HtmlPage,
  motifs: MotifsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
  beforeFonts?: (expanded: ExpandedFramePage) => void,
): Promise<{ page: HtmlPage; css: string; failures: FontFailure[] }> {
  const resolved = await expandFramePage(page, motifs, signal, placements, 'screen', pageWidths)
  beforeFonts?.(resolved)
  const { css, failures } = await pageFontCss(resolved.page, resolved.fonts, fonts, signal)
  return { page: resolved.page, css, failures }
}

export async function prepareShownPage(
  page: HtmlPage,
  motifs: MotifsOptions | undefined,
  slots: SlotsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
): Promise<{ page: HtmlPage; resolved?: PreparedSlots; css: string; failures: FontFailure[] }> {
  const expanded = await prepareExpandedPage(page, motifs, fonts, signal, placements, pageWidths, (expansion) => {
    const refusal = slotFillRefusal(expansion.page.scripts, expansion.page.slots, slots)
    if (refusal) throw refusal
  })
  const resolved = hasSlotWork(expanded.page.slots, slots) ? await prepareSlots(expanded.page.slots, slots, signal) : undefined
  return { ...expanded, resolved }
}
