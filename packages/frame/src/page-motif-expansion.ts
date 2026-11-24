import { AS_OF_CONTEXT, type AsOfDay, type MotifSource, RECORD_CONTEXT } from '@segnavia/format'
import {
  type ExpandedMotifs,
  expandLogoMotifs,
  expandMotifs,
  type HtmlPage,
  hasHostMotifPlacement,
  libraryMotifPlacementRefusal,
  MotifRefusedError,
  type PrintedHtmlPage,
  printedSectionBodies,
  withPrintedSectionBodies,
} from '@segnavia/html'
import { frameBrandLogo } from './frame-style-sheets.ts'

export const PARENT_MOTIF_SOURCE_REFUSAL = 'A parent-page motif placement could not establish its motif source; provide motifs.source to clear this refusal.'

export interface MotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  linkOrigins?: Iterable<string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}

export interface ParentRegion {
  name: string
  region: string
  html: string
}

export function pageParentRegions(page: HtmlPage | PrintedHtmlPage): ParentRegion[] {
  return (
    page.printedPages?.parents.flatMap((parent) =>
      Object.entries(parent.regions).map(([region, value]) => ({ name: parent.name, region, html: value.html })),
    ) ?? []
  )
}

export function expandPageLogoMotifs<T extends HtmlPage | PrintedHtmlPage>(page: T): T {
  const { logo, owner } = frameBrandLogo(page)
  const printedPages = page.printedPages
    ? {
        ...page.printedPages,
        ...(page.printedPages.sections !== undefined
          ? {
              sections: page.printedPages.sections.map((section) =>
                withPrintedSectionBodies(
                  section,
                  printedSectionBodies(section).map((html) => expandLogoMotifs(html, logo, owner)),
                ),
              ),
            }
          : {}),
        parents: page.printedPages.parents.map((parent) => ({
          ...parent,
          regions: Object.fromEntries(
            Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: expandLogoMotifs(region.html, logo, owner) }]),
          ),
        })),
      }
    : undefined
  return {
    ...page,
    ...('html' in page ? { html: expandLogoMotifs(page.html, logo, owner) } : {}),
    ...(printedPages ? { printedPages } : {}),
  } as T
}

export function pageMotifRefusal(bodyHtml: readonly string[], regions: readonly ParentRegion[]): MotifRefusedError | undefined {
  for (const html of bodyHtml) {
    const refusal = libraryMotifPlacementRefusal(html)
    if (refusal) return new MotifRefusedError(refusal)
  }
  for (const html of regions.map((region) => region.html)) {
    const refusal = libraryMotifPlacementRefusal(html, true)
    if (refusal) return new MotifRefusedError(refusal)
  }
  if (regions.some((region) => hasHostMotifPlacement(region.html))) {
    return new MotifRefusedError(PARENT_MOTIF_SOURCE_REFUSAL)
  }
  return undefined
}

export function motifSummary(results: ExpandedMotifs[]) {
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
  day?: AsOfDay,
) {
  const { logo, owner } = frameBrandLogo(page)
  const expand = (html: string, lang: string | undefined, furniture: boolean) =>
    expandMotifs(html, {
      source: motifs.source,
      pins: motifs.pins,
      lang,
      scripts: page.scripts,
      prefix: 'slot',
      linkOrigins: motifs.linkOrigins,
      signal,
      day,
      logo,
      logoBrand: owner,
      deferPaths: furniture ? [RECORD_CONTEXT, AS_OF_CONTEXT] : [AS_OF_CONTEXT],
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
    regions: Object.fromEntries(
      Object.entries(parent.regions).map(([name, region]) => [name, { ...region, html: parentResults.get(`${parent.name}:${name}`)?.html ?? region.html }]),
    ),
  }))
}
