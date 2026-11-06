import type { Deck, Page, Print } from '@segnavia/format'

export const internalPageLoad = Symbol('internalPageLoad')
export const internalThumbnailDeckLoad = Symbol('internalThumbnailDeckLoad')
export const internalThumbnailPageLoad = Symbol('internalThumbnailPageLoad')
export const internalDocumentPagesLoad = Symbol('internalDocumentPagesLoad')
export const internalPaperPagesLoad = Symbol('internalPaperPagesLoad')

export function loadPageValue(target: { [internalPageLoad]?: (page: Page) => void; load(input: never): unknown }, page: Page): void {
  const internal = target[internalPageLoad]
  if (internal) internal.call(target, page)
  else target.load(page as never)
}

export function loadThumbnailPageValue(target: { [internalThumbnailPageLoad]?: (page: Page | null) => void; page: unknown }, page: Page | null): void {
  const internal = target[internalThumbnailPageLoad]
  if (internal) internal.call(target, page)
  else target.page = page
}

export function loadThumbnailDeckValue(target: { [internalThumbnailDeckLoad]?: (deck: Deck | null) => void; deck: unknown }, deck: Deck | null): void {
  const internal = target[internalThumbnailDeckLoad]
  if (internal) internal.call(target, deck)
  else target.deck = deck
}

export function loadDocumentPagesValue(
  target: { [internalDocumentPagesLoad]?: (pages: Page[], print?: Print) => void; pages: Page[]; print?: Print | null },
  pages: Page[],
  print?: Print,
): void {
  const internal = target[internalDocumentPagesLoad]
  if (internal) internal.call(target, pages, print)
  else target.pages = pages
}
