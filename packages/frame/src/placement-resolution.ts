import {
  type AsOfDay,
  type Book,
  type BookView,
  FULL_PAGE_SIZE,
  type PageWidths,
  paperPixels,
  resolveBookPageGeometry,
  resolvePageWidth,
  sheetMm,
} from '@segnavia/format'
import type { HtmlPage, PrintedHtmlPage } from '@segnavia/html'
import { resolvePlacements } from '@segnavia/html'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'

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
): Promise<string> {
  if (!placements) return Promise.resolve(html)
  const width = page.print ? paperPixels(sheetMm(page.print).width) : resolvePageWidth(page.size, pageWidths).viewportWidth
  return resolvePlacements(html, { resolvePlacement: placements.resolve, report: placements.report, purpose, width, signal, day })
}

export async function resolvePagePlacements(
  page: HtmlPage,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
  day?: AsOfDay,
): Promise<HtmlPage> {
  if (!placements) return page
  const html = await resolvePagePlacementHtml(page, page.html, placements, purpose, signal, pageWidths, day)
  if (!page.printedPages) return { ...page, html }
  const parents = await resolveParentPlacements(page, placements, purpose, signal, pageWidths, day)
  return { ...page, html, printedPages: { ...page.printedPages, parents } }
}

export async function resolvePrintedPagePlacements(
  page: PrintedHtmlPage,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
  day?: AsOfDay,
): Promise<PrintedHtmlPage> {
  if (!placements) return page
  const sections = await Promise.all(
    page.printedPages.sections.map(async (section) => ({
      ...section,
      html: await resolvePagePlacementHtml(page, section.html, placements, purpose, signal, pageWidths, day),
    })),
  )
  const parents = await resolveParentPlacements(page, placements, purpose, signal, pageWidths, day)
  return { ...page, printedPages: { ...page.printedPages, sections, parents } }
}

async function resolveParentPlacements(
  page: HtmlPage | PrintedHtmlPage,
  placements: PlacementsOptions,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
  day?: AsOfDay,
) {
  return Promise.all(
    (page.printedPages?.parents ?? []).map(async (parent) => ({
      ...parent,
      ...(parent.head === undefined ? {} : { head: await resolvePagePlacementHtml(page, parent.head, placements, purpose, signal, pageWidths, day) }),
      ...(parent.foot === undefined ? {} : { foot: await resolvePagePlacementHtml(page, parent.foot, placements, purpose, signal, pageWidths, day) }),
    })),
  )
}
