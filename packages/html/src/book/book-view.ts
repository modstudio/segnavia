import { type Book, type BookView, bookParentPages, resolveDirection, sheetMm } from '@segnavia/format'
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
  if (book.mode !== 'paginated' || !book.page) return view
  const paper = sheetMm(book.page)
  return {
    ...view,
    pagination: {
      paper,
      margin: book.page.margin,
      columnGap: book.page.columnGap,
      direction: resolveDirection(book.dir, book.lang, book.title),
      numbering: book.numbering,
      rectoOpenings: book.rectoOpenings,
      orphans: book.orphans,
      widows: book.widows,
      parents: bookParentPages(book.page.margin),
      endnotePlacement: book.endnotes.placement,
      contents: book.contents,
      runningHead: book.runningHead,
    },
  }
}
