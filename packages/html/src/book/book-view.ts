import { type Book, type BookView, resolveBookPagination } from '@segnavia/format'
import { bookDocument } from './book-document.ts'

export function bookViewFromHtml(book: Book, html: string): BookView {
  const view: BookView = {
    html,
    title: book.title,
    scripts: book.scripts,
    ...(book.dir === undefined ? {} : { dir: book.dir }),
    ...(book.lang === undefined ? {} : { lang: book.lang }),
    ...(book.fonts === undefined ? {} : { fonts: book.fonts }),
    ...(book.css === undefined ? {} : { css: book.css }),
  }
  const pagination = resolveBookPagination(book)
  return pagination ? { ...view, pagination } : view
}

export function bookView(book: Book): BookView {
  const document = bookDocument(book)
  const flow = book.mode === 'paginated' ? bookDocument(book, { build: 'flow' }) : undefined
  const issues = document.issues.length > 0 ? document.issues : (flow?.issues ?? [])
  if (issues.length > 0) throw new Error(`The book cannot be shown: ${issues.join('; ')}.`)
  const view = bookViewFromHtml(book, document.html)
  return flow ? { ...view, flow: flow.html } : view
}
