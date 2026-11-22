import {
  type AsOfDay,
  type Book,
  type BookView,
  FULL_PAGE_SIZE,
  type PageWidths,
  type PreflightEntry,
  type PreflightProfile,
  paperPixels,
  resolveBookPageGeometry,
  resolvePageWidth,
  sheetMm,
} from '@segnavia/format'
import type { HtmlPage, PrintedHtmlPage, SoundPlacements } from '@segnavia/html'
import {
  PLACED_PDF_SOURCES,
  type PlacementReport,
  placementMissingEntry,
  printedSectionBodies,
  resolvePlacementsWithSounds,
  withPrintedSectionBodies,
} from '@segnavia/html'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'

export interface PlacementPreflight {
  profile: PreflightProfile
  entries: PreflightEntry[]
}

export function placementReportWithPreflight(report: PlacementReport | undefined, preflight: PlacementPreflight | undefined): PlacementReport | undefined {
  if (!report && (!preflight || preflight.profile['placement-missing'] === 'off')) return undefined
  return (entry) => {
    report?.(entry)
    if (preflight && preflight.profile['placement-missing'] !== 'off') preflight.entries.push(placementMissingEntry(entry))
  }
}

export function bookPlacementWidth(book: Book | BookView, pageGeometry?: string, pageWidths?: PageWidths): number {
  if ('pagination' in book && book.pagination) {
    const geometry = pageGeometry === undefined ? book.pagination.geometries[0] : book.pagination.geometries.find((item) => item.name === pageGeometry)
    return paperPixels(geometry?.paper.width ?? book.pagination.paper.width)
  }
  if ('page' in book && book.page) return paperPixels(resolveBookPageGeometry(book, pageGeometry)?.paper.width ?? sheetMm(book.page).width)
  return resolvePageWidth(FULL_PAGE_SIZE, pageWidths).viewportWidth
}

export function resolvePagePlacementHtml(
  page: HtmlPage | PrintedHtmlPage,
  html: string,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
  day?: AsOfDay,
  preflight?: PlacementPreflight,
  sounds: SoundPlacements = new Map(),
): Promise<string> {
  if (!placements) return Promise.resolve(html)
  const width = page.print ? paperPixels(sheetMm(page.print).width) : resolvePageWidth(page.size, pageWidths).viewportWidth
  return resolvePlacementsWithSounds(html, {
    resolvePlacement: placements.resolve,
    report: placementReportWithPreflight(placements.report, preflight),
    purpose,
    width,
    signal,
    day,
    pdfSources: placements[PLACED_PDF_SOURCES],
    sounds,
  }).then((resolved) => resolved.html)
}

export interface ResolvedPagePlacements {
  page: HtmlPage
  sounds: SoundPlacements
}

export async function resolvePagePlacements(
  page: HtmlPage,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
  day?: AsOfDay,
  preflight?: PlacementPreflight,
): Promise<ResolvedPagePlacements> {
  if (!placements) return { page, sounds: new Map() }
  const sounds: SoundPlacements = new Map()
  const html = await resolvePagePlacementHtml(page, page.html, placements, purpose, signal, pageWidths, day, preflight, sounds)
  if (!page.printedPages) return { page: { ...page, html }, sounds }
  const parents = await resolveParentPlacements(page, placements, purpose, signal, pageWidths, day, preflight, sounds)
  return { page: { ...page, html, printedPages: { ...page.printedPages, parents } }, sounds }
}

export async function resolvePrintedPagePlacements(
  page: PrintedHtmlPage,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
  day?: AsOfDay,
  preflight?: PlacementPreflight,
): Promise<PrintedHtmlPage> {
  if (!placements) return page
  const sections = await Promise.all(
    page.printedPages.sections.map(async (section) =>
      withPrintedSectionBodies(
        section,
        await Promise.all(
          printedSectionBodies(section).map(async (html) => resolvePagePlacementHtml(page, html, placements, purpose, signal, pageWidths, day, preflight)),
        ),
      ),
    ),
  )
  const parents = await resolveParentPlacements(page, placements, purpose, signal, pageWidths, day, preflight)
  return { ...page, printedPages: { ...page.printedPages, sections, parents } }
}

async function resolveParentPlacements(
  page: HtmlPage | PrintedHtmlPage,
  placements: PlacementsOptions,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
  day?: AsOfDay,
  preflight?: PlacementPreflight,
  sounds: SoundPlacements = new Map(),
) {
  return Promise.all(
    (page.printedPages?.parents ?? []).map(async (parent) => ({
      ...parent,
      regions: Object.fromEntries(
        await Promise.all(
          Object.entries(parent.regions).map(async ([name, region]) => [
            name,
            { ...region, html: await resolvePagePlacementHtml(page, region.html, placements, purpose, signal, pageWidths, day, preflight, sounds) },
          ]),
        ),
      ),
    })),
  )
}
