import type { Book, BookView } from '@segnavia/format'
import { bookViewFromHtml, bookDocument as htmlBookDocument } from '@segnavia/html'
import { composerScript } from './book-composer.ts'
import { type PaginatedDocumentOptions, paginatedViewDocument } from './book-view-document.ts'

export { BOOK_COMPOSED_ATTRIBUTE, BOOK_COMPOSED_MS_ATTRIBUTE, BOOK_FAILURE_ATTRIBUTE } from './book-composer.ts'

export class PaginatedBookRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaginatedBookRefusedError'
  }
}

export function bookViewDocument(view: BookView, options: PaginatedDocumentOptions): string {
  if (!view.pagination) {
    throw new PaginatedBookRefusedError('A paginated book view needs pagination; supply a paginated BookView to clear this refusal.')
  }
  return paginatedViewDocument(view, view.pagination, options)
}

export function bookDocument(book: Book, options: Pick<PaginatedDocumentOptions, 'nonce' | 'fontCss' | 'css' | 'printBackground'>): string {
  if (book.mode !== 'paginated' || !book.page) {
    throw new PaginatedBookRefusedError('A paginated book document needs mode paginated and page; set both to clear this refusal.')
  }
  const built = htmlBookDocument(book)
  if (built.issues.length > 0) throw new PaginatedBookRefusedError(`The book cannot be printed: ${built.issues.join('; ')}.`)
  const view = bookViewFromHtml(book, built.html)
  if (!view.pagination) throw new PaginatedBookRefusedError('A paginated book document could not resolve pagination.')
  return paginatedViewDocument(view, view.pagination, options)
}

export const BOOK_COMPOSER_SCRIPT = composerScript('{}')
