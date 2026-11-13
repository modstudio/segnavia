import { type Book, type BookView, type OutlineSource, resolveBookPagination } from '@segnavia/format'
import { bookOutlineSource } from '../document-outline.ts'
import { bookDocument } from './book-document.ts'

export function bookViewFromHtml(book: Book, html: string, outline?: OutlineSource): BookView {
  const view: BookView = {
    html,
    title: book.title,
    scripts: book.scripts,
    ...(book.brand === undefined ? {} : { brand: book.brand }),
    ...(book.dir === undefined ? {} : { dir: book.dir }),
    ...(book.lang === undefined ? {} : { lang: book.lang }),
    ...(book.style === undefined ? {} : { style: book.style }),
    ...(book.limits === undefined ? {} : { limits: book.limits }),
    ...(book.asOf === undefined ? {} : { asOf: book.asOf }),
  }
  const pagination = resolveBookPagination(book)
  return pagination ? { ...view, pagination: { ...pagination, ...(outline === undefined ? {} : { outline }) } } : view
}

export function bookView(book: Book): BookView {
  const document = bookDocument(book)
  const flow = book.mode === 'paginated' ? bookDocument(book, { build: 'flow' }) : undefined
  const issues = document.issues.length > 0 ? document.issues : (flow?.issues ?? [])
  if (issues.length > 0) throw new Error(`The book cannot be shown: ${issues.join('; ')}.`)
  const view = bookViewFromHtml(book, document.html, bookOutlineSource(book, document))
  return { ...view, ...(flow ? { flow: flow.html } : {}) }
}
