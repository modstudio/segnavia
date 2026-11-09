import type { AsOfDay, FontFailure, PageWidths, SlotsOptions } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { slotsWithDay } from './day-slots.ts'
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
  day?: AsOfDay,
): Promise<{ page: HtmlPage; css: string; failures: FontFailure[] }> {
  const resolved = await expandFramePage(page, motifs, signal, placements, 'screen', pageWidths, day)
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
  day?: AsOfDay,
): Promise<{ page: HtmlPage; resolved?: PreparedSlots; css: string; failures: FontFailure[] }> {
  const expanded = await prepareExpandedPage(
    page,
    motifs,
    fonts,
    signal,
    placements,
    pageWidths,
    (expansion) => {
      const refusal = slotFillRefusal(expansion.page.scripts, expansion.page.slots, slots)
      if (refusal) throw refusal
    },
    day,
  )
  const bindsDay = /data-slot-(?:value|href|src|present|when|each|width)=["'][^"']*\basOf(?:\.|["'])/.test(expanded.page.html)
  const effectiveSlots = day && bindsDay ? slotsWithDay(slots, day, slots?.source, true) : slots
  const resolved = hasSlotWork(expanded.page.slots, effectiveSlots) ? await prepareSlots(expanded.page.slots, effectiveSlots, signal) : undefined
  return { ...expanded, resolved }
}
