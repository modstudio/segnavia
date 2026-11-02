import { type Book, type BookView, type Page, type PageWidths, paperPixels, resolvePageWidth, sheetMm } from '@segnavia/format'
import { resolvePlacements } from '@segnavia/html'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'

export function bookPlacementWidth(book: Book | BookView, pageWidths?: PageWidths): number {
  if ('pagination' in book && book.pagination) return paperPixels(book.pagination.paper.width)
  if ('page' in book && book.page) return paperPixels(sheetMm(book.page).width)
  return resolvePageWidth({ width: 'full', height: 'auto' }, pageWidths).viewportWidth
}

function resolvePlacementHtml(
  page: Page,
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
  page: Page,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
): Promise<Page> {
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
