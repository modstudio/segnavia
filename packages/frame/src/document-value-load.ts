import type { Deck, Page, Print } from '@segnavia/format'

export const internalPageLoad = Symbol.for('@segnavia/frame/internal-page-load')
export const internalThumbnailDeckLoad = Symbol.for('@segnavia/frame/internal-thumbnail-deck-load')
export const internalThumbnailPageLoad = Symbol.for('@segnavia/frame/internal-thumbnail-page-load')
export const internalDocumentPagesLoad = Symbol.for('@segnavia/frame/internal-document-pages-load')
export const internalDocumentPagesRead = Symbol.for('@segnavia/frame/internal-document-pages-read')
export const internalPaperPagesLoad = Symbol.for('@segnavia/frame/internal-paper-pages-load')

export function loadPageValue(target: { [internalPageLoad]: (page: Page) => void }, page: Page): void {
  const internal = target[internalPageLoad]
  internal.call(target, page)
}

export function loadThumbnailPageValue(target: { [internalThumbnailPageLoad]: (page: Page | null) => void }, page: Page | null): void {
  const internal = target[internalThumbnailPageLoad]
  internal.call(target, page)
}

export function loadThumbnailDeckValue(target: { [internalThumbnailDeckLoad]: (deck: Deck | null) => void }, deck: Deck | null): void {
  const internal = target[internalThumbnailDeckLoad]
  internal.call(target, deck)
}

export function loadDocumentPagesValue(target: { [internalDocumentPagesLoad]: (pages: Page[], print?: Print) => void }, pages: Page[], print?: Print): void {
  const internal = target[internalDocumentPagesLoad]
  internal.call(target, pages, print)
}

export function documentPageValues(target: { [internalDocumentPagesRead]: () => Page[] }): Page[] {
  return target[internalDocumentPagesRead]()
}
