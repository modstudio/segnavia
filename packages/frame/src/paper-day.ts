import type { AsOfDay, PageWidths, SlotsOptions } from '@segnavia/format'
import { fillPageAsOfBindings, type HtmlPage, resolveDayContextsFor } from '@segnavia/html'
import type { captureAsOfLoad } from './as-of-element.ts'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { expandFramePages, type MotifsOptions } from './motif-expansion.ts'
import { expandedPagesFontCss, type FontsOptions } from './page-fonts.ts'
import { hasSlotWork, type PreparedSlots, prepareSlotCollection, slotFillRefusal } from './slot-render.ts'

export async function preparePaperDays(
  pages: HtmlPage[],
  inputs: ReturnType<typeof captureAsOfLoad>,
  options: {
    slots?: SlotsOptions
    motifs?: MotifsOptions
    placements?: PlacementsOptions
    pageWidths?: PageWidths
    fonts?: FontsOptions
    signal: AbortSignal
  },
): Promise<{ pages: HtmlPage[]; days: AsOfDay[]; css: string; slots?: PreparedSlots }> {
  const contexts = await resolveDayContextsFor(
    pages,
    {
      moment: inputs.moment,
      anchors: inputs.anchors,
      asOf: inputs.hostZone === undefined ? undefined : { zone: inputs.hostZone },
    },
    options.slots,
    options.signal,
  )
  const dated = pages.map((page, index) => fillPageAsOfBindings(page, contexts.pages[index]?.day))
  const expanded = await expandFramePages(
    dated,
    options.motifs,
    options.signal,
    options.placements,
    'screen',
    options.pageWidths,
    contexts.pages.map(({ day }) => day),
  )
  const shown = expanded.map(({ page }) => page)
  const { css } = await expandedPagesFontCss(expanded, options.fonts, options.signal)
  const refusal = shown.map((page) => slotFillRefusal(page.scripts, page.slots, options.slots)).find((error) => error !== undefined)
  if (refusal) throw refusal
  const declarations = shown.map((page) => page.slots)
  const slots = declarations.some((item) => hasSlotWork(item, options.slots))
    ? await prepareSlotCollection(declarations, contexts.pages[0]?.slots, options.signal)
    : undefined
  return { pages: shown, days: contexts.days, css, slots }
}
