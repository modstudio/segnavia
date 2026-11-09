import type { FontReference, PageWidths } from '@segnavia/format'
import { documentLanguage, type PrintedHtmlPage } from '@segnavia/html'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { expandedPageParents, expandPageMotifs, type MotifsOptions, pageMotifRefusal, pageParentRegions } from './page-motif-expansion.ts'
import { resolvePrintedPagePlacements } from './placement-resolution.ts'

export interface ExpandedPrintedFramePage {
  page: PrintedHtmlPage
  fonts: FontReference[]
}

export async function expandPrintedFramePage(
  page: PrintedHtmlPage,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
): Promise<ExpandedPrintedFramePage> {
  const regions = pageParentRegions(page)
  if (!motifs) {
    const refusal = pageMotifRefusal(
      page.printedPages.sections.map((section) => section.html),
      regions,
    )
    if (refusal) throw refusal
    return { page: await resolvePrintedPagePlacements(page, placements, purpose, signal, pageWidths), fonts: [] }
  }
  const parentLang = page.lang?.trim() || documentLanguage(page.printedPages.sections.map((section) => section.html).join(''))
  const { bodyResults, parentResults, fonts } = await expandPageMotifs(
    page,
    page.printedPages.sections.map((section) => ({ html: section.html, lang: page.lang?.trim() || documentLanguage(section.html) })),
    regions,
    parentLang,
    motifs,
    signal,
  )
  const expandedPage: PrintedHtmlPage = {
    ...page,
    printedPages: {
      ...page.printedPages,
      sections: page.printedPages.sections.map((section, index) => ({ ...section, html: bodyResults[index]?.html ?? section.html })),
      parents: expandedPageParents(page, parentResults),
    },
  }
  return { page: await resolvePrintedPagePlacements(expandedPage, placements, purpose, signal, pageWidths), fonts }
}
