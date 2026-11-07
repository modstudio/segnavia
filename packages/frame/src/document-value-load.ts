import type { Deck, Page, Print } from '@segnavia/format'

export const internalPageLoad = Symbol('internalPageLoad')
export const internalThumbnailDeckLoad = Symbol('internalThumbnailDeckLoad')
export const internalThumbnailPageLoad = Symbol('internalThumbnailPageLoad')
export const internalDocumentPagesLoad = Symbol('internalDocumentPagesLoad')
export const internalDocumentPagesRead = Symbol('internalDocumentPagesRead')
export const internalPaperPagesLoad = Symbol('internalPaperPagesLoad')

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
