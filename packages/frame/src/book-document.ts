import { type Book, type BookView, resolveBookPagination } from '@segnavia/format'
import { bookDocument as htmlBookDocument } from '@segnavia/html'
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

export function bookDocument(book: Book, options: { nonce: string; css?: string; printBackground?: boolean }): string {
  const pagination = resolveBookPagination(book)
  if (!pagination) {
    throw new PaginatedBookRefusedError('A paginated book document needs mode paginated and page; set both to clear this refusal.')
  }
  const built = htmlBookDocument(book)
  if (built.issues.length > 0) throw new PaginatedBookRefusedError(`The book cannot be printed: ${built.issues.join('; ')}.`)
  return paginatedViewDocument(
    {
      html: built.html,
      title: book.title,
      scripts: book.scripts,
      ...(book.dir === undefined ? {} : { dir: book.dir }),
      ...(book.lang === undefined ? {} : { lang: book.lang }),
      ...(book.fonts === undefined ? {} : { fonts: book.fonts }),
      pagination,
    },
    pagination,
    options,
  )
}

export const BOOK_COMPOSER_SCRIPT = composerScript('{}')
