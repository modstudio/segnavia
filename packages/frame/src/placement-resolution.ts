import { type Book, type BookView, FULL_PAGE_SIZE, type PageWidths, paperPixels, resolveBookPageGeometry, resolvePageWidth, sheetMm } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
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

function resolvePlacementHtml(
  page: HtmlPage,
  html: string,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
): Promise<string> {
  if (!placements) return Promise.resolve(html)
  const width = page.print ? paperPixels(sheetMm(page.print).width) : resolvePageWidth(page.size, pageWidths).viewportWidth
  return resolvePlacements(html, { resolvePlacement: placements.resolve, report: placements.report, purpose, width, signal })
}

export async function resolvePagePlacements(
  page: HtmlPage,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
): Promise<HtmlPage> {
  if (!placements) return page
  const html = await resolvePlacementHtml(page, page.html, placements, purpose, signal, pageWidths)
  if (!page.printedPages) return { ...page, html }
  const parents = await Promise.all(
    page.printedPages.parents.map(async (parent) => ({
      ...parent,
      ...(parent.head === undefined ? {} : { head: await resolvePlacementHtml(page, parent.head, placements, purpose, signal, pageWidths) }),
      ...(parent.foot === undefined ? {} : { foot: await resolvePlacementHtml(page, parent.foot, placements, purpose, signal, pageWidths) }),
    })),
  )
  return { ...page, html, printedPages: { ...page.printedPages, parents } }
}
