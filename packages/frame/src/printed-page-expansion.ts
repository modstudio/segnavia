import type { AsOfDay, FontReference, PageWidths, PreflightEntry, PreflightProfile } from '@segnavia/format'
import { documentLanguage, type PrintedHtmlPage } from '@segnavia/html'
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
  const bodies = page.printedPages.sections.flatMap((section) => ('pages' in section ? section.pages : [{ html: section.html }]))
  if (!motifs) {
    const refusal = pageMotifRefusal(
      bodies.map((body) => body.html),
      regions,
    )
    if (refusal) throw refusal
    return {
      page: await resolvePrintedPagePlacements(page, placements, purpose, signal, pageWidths, day, preflight),
      fonts: [],
      preflight: preflight?.entries ?? [],
    }
  }
  const parentLang = page.lang?.trim() || documentLanguage(bodies.map((body) => body.html).join(''))
  const { bodyResults, parentResults, fonts } = await expandPageMotifs(
    page,
    bodies.map((body) => ({ html: body.html, lang: page.lang?.trim() || documentLanguage(body.html) })),
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
      sections: page.printedPages.sections.map((section) => {
        if ('pages' in section) {
          const pages = section.pages.map((held) => ({ html: bodyResults[bodyIndex++]?.html ?? held.html }))
          return { ...section, pages }
        }
        return { ...section, html: bodyResults[bodyIndex++]?.html ?? section.html }
      }),
      parents: expandedPageParents(page, parentResults),
    },
  }
  return {
    page: await resolvePrintedPagePlacements(expandedPage, placements, purpose, signal, pageWidths, day, preflight),
    fonts,
    preflight: preflight?.entries ?? [],
  }
}
