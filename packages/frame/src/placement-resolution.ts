import { type Book, type BookView, FLUID_WIDTH, type Page, paperPixels, sheetMm } from '@segnavia/format'
import { type PlacementsOptions, resolvePlacements } from '@segnavia/html'

export function bookPlacementWidth(book: Book | BookView): number {
  if ('pagination' in book && book.pagination) return paperPixels(book.pagination.paper.width)
  if ('page' in book && book.page) return paperPixels(sheetMm(book.page).width)
  return FLUID_WIDTH
}

function resolvePlacementHtml(
  page: Page,
  html: string,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
): Promise<string> {
  if (!placements) return Promise.resolve(html)
  const width = page.print ? paperPixels(sheetMm(page.print).width) : page.size === 'fluid' ? FLUID_WIDTH : page.size.width
  return resolvePlacements(html, { resolvePlacement: placements.resolve, report: placements.report, purpose, width, signal })
}

export async function resolvePagePlacements(
  page: Page,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
): Promise<Page> {
  if (!placements) return page
  const html = await resolvePlacementHtml(page, page.html, placements, purpose, signal)
  if (!page.printedPages) return { ...page, html }
  const parents = await Promise.all(
    page.printedPages.parents.map(async (parent) => ({
      ...parent,
      ...(parent.head === undefined ? {} : { head: await resolvePlacementHtml(page, parent.head, placements, purpose, signal) }),
      ...(parent.foot === undefined ? {} : { foot: await resolvePlacementHtml(page, parent.foot, placements, purpose, signal) }),
    })),
  )
  return { ...page, html, printedPages: { ...page.printedPages, parents } }
}
