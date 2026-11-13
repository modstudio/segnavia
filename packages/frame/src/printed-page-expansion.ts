import type { AsOfDay, FontReference, PageWidths, PreflightEntry, PreflightProfile } from '@segnavia/format'
import { documentLanguage, type PrintedHtmlPage, printedSectionBodies, withPrintedSectionBodies } from '@segnavia/html'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { expandedPageParents, expandPageMotifs, type MotifsOptions, pageMotifRefusal, pageParentRegions } from './page-motif-expansion.ts'
import { type PlacementPreflight, resolvePrintedPagePlacements } from './placement-resolution.ts'

export interface ExpandedPrintedFramePage {
  page: PrintedHtmlPage
  fonts: FontReference[]
  preflight: PreflightEntry[]
}

export async function expandPrintedFramePage(
  page: PrintedHtmlPage,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
  day?: AsOfDay,
  profile?: PreflightProfile,
): Promise<ExpandedPrintedFramePage> {
  const preflight: PlacementPreflight | undefined = profile ? { profile, entries: [] } : undefined
  const regions = pageParentRegions(page)
  const bodies = page.printedPages.sections.flatMap(printedSectionBodies)
  if (!motifs) {
    const refusal = pageMotifRefusal(bodies, regions)
    if (refusal) throw refusal
    return {
      page: await resolvePrintedPagePlacements(page, placements, purpose, signal, pageWidths, day, preflight),
      fonts: [],
      preflight: preflight?.entries ?? [],
    }
  }
  const parentLang = page.lang?.trim() || documentLanguage(bodies.join(''))
  const { bodyResults, parentResults, fonts } = await expandPageMotifs(
    page,
    bodies.map((html) => ({ html, lang: page.lang?.trim() || documentLanguage(html) })),
    regions,
    parentLang,
    motifs,
    signal,
    day,
  )
  let bodyIndex = 0
  const expandedPage: PrintedHtmlPage = {
    ...page,
    printedPages: {
      ...page.printedPages,
      sections: page.printedPages.sections.map((section) =>
        withPrintedSectionBodies(
          section,
          printedSectionBodies(section).map((html) => bodyResults[bodyIndex++]?.html ?? html),
        ),
      ),
      parents: expandedPageParents(page, parentResults),
    },
  }
  return {
    page: await resolvePrintedPagePlacements(expandedPage, placements, purpose, signal, pageWidths, day, preflight),
    fonts,
    preflight: preflight?.entries ?? [],
  }
}
