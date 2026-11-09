import { type FontReference, type MotifSource, type PageWidths, PRINTED_PAGE_CONTEXT } from '@segnavia/format'
import {
  documentLanguage,
  type ExpandedMotifs,
  expandMotifs,
  hasMotifPlacement,
  libraryMotifPlacementRefusal,
  MotifRefusedError,
  type PrintedHtmlPage,
} from '@segnavia/html'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { resolvePrintedPagePlacements } from './placement-resolution.ts'

interface PrintedMotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  linkOrigins?: Iterable<string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}

export interface ExpandedPrintedFramePage {
  page: PrintedHtmlPage
  fonts: FontReference[]
}

function parentRegions(page: PrintedHtmlPage): Array<{ name: string; region: 'head' | 'foot'; html: string }> {
  return page.printedPages.parents.flatMap((parent) =>
    (['head', 'foot'] as const).flatMap((region) => (parent[region] === undefined ? [] : [{ name: parent.name, region, html: parent[region] }])),
  )
}

function printedMotifRefusal(page: PrintedHtmlPage): MotifRefusedError | undefined {
  const regions = parentRegions(page)
  for (const html of [...page.printedPages.sections.map((section) => section.html), ...regions.map((region) => region.html)]) {
    const refusal = libraryMotifPlacementRefusal(html)
    if (refusal) return new MotifRefusedError(refusal)
  }
  if (regions.some((region) => hasMotifPlacement(region.html))) {
    return new MotifRefusedError('A parent-page motif placement could not establish its motif source; provide motifs.source to clear this refusal.')
  }
  return undefined
}

function motifSummary(results: ExpandedMotifs[]) {
  return {
    placed: results.flatMap((result) => result.placed),
    fonts: results.flatMap((result) => result.fonts),
    unavailable: [...new Set(results.flatMap((result) => result.unavailable))],
  }
}

export async function expandPrintedFramePage(
  page: PrintedHtmlPage,
  motifs: PrintedMotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
): Promise<ExpandedPrintedFramePage> {
  const regions = parentRegions(page)
  if (!motifs) {
    const refusal = printedMotifRefusal(page)
    if (refusal) throw refusal
    return { page: await resolvePrintedPagePlacements(page, placements, purpose, signal, pageWidths), fonts: [] }
  }
  const expand = (html: string, lang: string | undefined, furniture: boolean) =>
    expandMotifs(html, {
      source: motifs.source,
      pins: motifs.pins,
      lang,
      scripts: page.scripts,
      prefix: 'slot',
      linkOrigins: motifs.linkOrigins,
      signal,
      ...(furniture ? { deferPaths: [PRINTED_PAGE_CONTEXT] } : {}),
    })
  const bodyResults = await Promise.all(
    page.printedPages.sections.map((section) => expand(section.html, page.lang?.trim() || documentLanguage(section.html), false)),
  )
  const parentLang = page.lang?.trim() || documentLanguage(page.printedPages.sections.map((section) => section.html).join(''))
  const parentResults = new Map(
    await Promise.all(regions.map(async ({ name, region, html }) => [`${name}:${region}`, await expand(html, parentLang, true)] as const)),
  )
  signal.throwIfAborted()
  const summary = motifSummary([...bodyResults, ...parentResults.values()])
  motifs.placed?.(summary)
  const expandedPage: PrintedHtmlPage = {
    ...page,
    printedPages: {
      ...page.printedPages,
      sections: page.printedPages.sections.map((section, index) => ({ ...section, html: bodyResults[index]?.html ?? section.html })),
      parents: page.printedPages.parents.map((parent) => ({
        ...parent,
        ...(parent.head === undefined ? {} : { head: parentResults.get(`${parent.name}:head`)?.html ?? parent.head }),
        ...(parent.foot === undefined ? {} : { foot: parentResults.get(`${parent.name}:foot`)?.html ?? parent.foot }),
      })),
    },
  }
  return { page: await resolvePrintedPagePlacements(expandedPage, placements, purpose, signal, pageWidths), fonts: summary.fonts }
}
