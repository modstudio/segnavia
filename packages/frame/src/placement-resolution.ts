import { type Book, type BookView, type Page, paperPixels, sheetMm } from '@segnavia/format'
import { type PlacementsOptions, resolvePlacements } from '@segnavia/html'

export function bookPlacementWidth(book: Book | BookView): number {
  if ('pagination' in book && book.pagination) return paperPixels(book.pagination.paper.width)
  if ('page' in book && book.page) return paperPixels(sheetMm(book.page).width)
  return 1024
}

export function resolvePagePlacements(
  page: Page,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
): Promise<string> {
  if (!placements) return Promise.resolve(page.html)
  const width = page.print ? paperPixels(sheetMm(page.print).width) : page.size === 'fluid' ? 1024 : page.size.width
  return resolvePlacements(page.html, { resolvePlacement: placements.resolve, report: placements.report, purpose, width, signal })
}
