import { type Book, type BookView, bookFromDocument, type DocumentInput, Refusal } from '@segnavia/format'
import { bookOutlineSource, bookViewFromHtml, bookDocument as htmlBookDocument, parseDocument } from '@segnavia/html'
import { type PaginatedDocumentOptions, paginatedViewDocument } from './book-view-document.ts'
import { COMPOSER_SCRIPT } from './composer.ts'
import { refuseNamedDocumentBrand } from './document-brand-refusal.ts'

export {
  COMPOSE_FAILURE_ATTRIBUTE as BOOK_FAILURE_ATTRIBUTE,
  COMPOSED_ATTRIBUTE as BOOK_COMPOSED_ATTRIBUTE,
  COMPOSED_MS_ATTRIBUTE as BOOK_COMPOSED_MS_ATTRIBUTE,
} from './composer.ts'
export { PREFLIGHT_ATTRIBUTE } from './composer-preflight.ts'

export class PaginatedBookRefusedError extends Refusal {
  constructor(message: string) {
    super('paginated-book', message)
    this.name = 'PaginatedBookRefusedError'
  }
}

export function bookViewDocument(view: BookView, options: PaginatedDocumentOptions): string {
  if (!view.pagination) {
    throw new PaginatedBookRefusedError('A paginated book view needs pagination; supply a paginated BookView to clear this refusal.')
  }
  return paginatedViewDocument(view, view.pagination, options)
}

export function bookDocument(
  input: DocumentInput,
  options: Pick<
    PaginatedDocumentOptions,
    | 'nonce'
    | 'fontCss'
    | 'css'
    | 'printBackground'
    | 'layoutScripts'
    | 'limits'
    | 'plan'
    | 'breaks'
    | 'profile'
    | 'preflightSeed'
    | 'progress'
    | 'progressCallback'
  >,
): string {
  const document = parseDocument(input)
  refuseNamedDocumentBrand(document, 'bookValueDocument')
  return bookValueDocument(bookFromDocument(document), options)
}

export function bookValueDocument(
  book: Book,
  options: Pick<
    PaginatedDocumentOptions,
    | 'nonce'
    | 'fontCss'
    | 'css'
    | 'printBackground'
    | 'layoutScripts'
    | 'limits'
    | 'plan'
    | 'breaks'
    | 'profile'
    | 'preflightSeed'
    | 'progress'
    | 'progressCallback'
  >,
): string {
  if (book.mode !== 'paginated' || !book.page) {
    throw new PaginatedBookRefusedError('A paginated book document needs mode paginated and page; set both to clear this refusal.')
  }
  const built = htmlBookDocument(book, { targets: true })
  if (built.issues.length > 0) throw new PaginatedBookRefusedError(`The book cannot be printed: ${built.issues.join('; ')}.`)
  const view = bookViewFromHtml(book, built.html, bookOutlineSource(book, built))
  if (!view.pagination) throw new PaginatedBookRefusedError('A paginated book document could not resolve pagination.')
  return paginatedViewDocument(view, view.pagination, options)
}

export { COMPOSER_SCRIPT }
