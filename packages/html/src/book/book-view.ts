import { type Book, type BookView, resolveBookPagination } from '@segnavia/format'
import { bookDocument } from './book-document.ts'

export function bookView(book: Book): BookView {
  const document = bookDocument(book)
  if (document.issues.length > 0) throw new Error(`The book cannot be shown: ${document.issues.join('; ')}.`)
  const view: BookView = {
    html: document.html,
    title: book.title,
    scripts: book.scripts,
    ...(book.dir === undefined ? {} : { dir: book.dir }),
    ...(book.lang === undefined ? {} : { lang: book.lang }),
    ...(book.fonts === undefined ? {} : { fonts: book.fonts }),
  }
  const pagination = resolveBookPagination(book)
  return pagination ? { ...view, pagination } : view
}
