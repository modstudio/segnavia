import { type MotifSource, PRINTED_PAGE_CONTEXT } from '@segnavia/format'
import {
  type ExpandedMotifs,
  expandMotifs,
  type HtmlPage,
  hasMotifPlacement,
  libraryMotifPlacementRefusal,
  MotifRefusedError,
  type PrintedHtmlPage,
} from '@segnavia/html'

export interface MotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  linkOrigins?: Iterable<string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}

export interface ParentRegion {
  name: string
  region: 'head' | 'foot'
  html: string
}

export function pageParentRegions(page: HtmlPage | PrintedHtmlPage): ParentRegion[] {
  return (
    page.printedPages?.parents.flatMap((parent) =>
      (['head', 'foot'] as const).flatMap((region) => (parent[region] === undefined ? [] : [{ name: parent.name, region, html: parent[region] }])),
    ) ?? []
  )
}

export function pageMotifRefusal(bodyHtml: readonly string[], regions: readonly ParentRegion[]): MotifRefusedError | undefined {
  for (const html of [...bodyHtml, ...regions.map((region) => region.html)]) {
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

export async function expandPageMotifs(
  page: HtmlPage | PrintedHtmlPage,
  bodies: ReadonlyArray<{ html: string; lang: string | undefined }>,
  regions: readonly ParentRegion[],
  parentLang: string | undefined,
  motifs: MotifsOptions,
  signal: AbortSignal,
) {
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
  const bodyResults = await Promise.all(bodies.map((body) => expand(body.html, body.lang, false)))
  const parentResults = new Map(
    await Promise.all(regions.map(async ({ name, region, html }) => [`${name}:${region}`, await expand(html, parentLang, true)] as const)),
  )
  signal.throwIfAborted()
  const summary = motifSummary([...bodyResults, ...parentResults.values()])
  motifs.placed?.(summary)
  return { bodyResults, parentResults, fonts: summary.fonts }
}

export function expandedPageParents(page: HtmlPage | PrintedHtmlPage, parentResults: ReadonlyMap<string, ExpandedMotifs>) {
  return (page.printedPages?.parents ?? []).map((parent) => ({
    ...parent,
    ...(parent.head === undefined ? {} : { head: parentResults.get(`${parent.name}:head`)?.html ?? parent.head }),
    ...(parent.foot === undefined ? {} : { foot: parentResults.get(`${parent.name}:foot`)?.html ?? parent.foot }),
  }))
}
