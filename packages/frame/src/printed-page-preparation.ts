import type { AsOfDay, PageWidths, PreflightProfile } from '@segnavia/format'
import { fillPageAsOfBindings, type PrintedHtmlPage } from '@segnavia/html'
import type { MotifsOptions, PlacementsOptions } from './motif-expansion.ts'
import { expandPrintedFramePage } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { pageFontCss } from './page-fonts.ts'

export async function preparePrintedPage(
  page: PrintedHtmlPage,
  options: {
    motifs?: MotifsOptions
    placements?: PlacementsOptions
    widths?: PageWidths
    fonts?: FontsOptions
    signal: AbortSignal
    day?: AsOfDay
    profile: PreflightProfile
  },
) {
  const expanded = await expandPrintedFramePage(
    page,
    options.motifs,
    options.signal,
    options.placements,
    'screen',
    options.widths,
    options.day,
    options.profile,
  )
  expanded.page = fillPageAsOfBindings(expanded.page, options.day)
  const fonts = await pageFontCss(expanded.page, expanded.fonts, options.fonts, options.signal)
  return { expanded, fonts }
}
