import { expect, test } from 'bun:test'
import { BOOK_PARENT_NAMES, Book, bookParentPages } from '@segnavia/format'
import type { BookPrintedPagePlan } from '@segnavia/html'
import { marginCss, marginDocument } from './book-margins.ts'

test('fills catalogued furniture by its parsed motif key and uses its resolved parent margin', () => {
  const book = Book.parse({
    title: 'A Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { top: 10, bottom: 11, inner: 12, outer: 13 } },
    chapters: [{ title: 'One', html: '<p>Text</p>' }],
  })
  const parents = bookParentPages(book.page?.margin ?? { top: 0, bottom: 0, inner: 0, outer: 0 })
  const recto = parents.find((parent) => parent.name === BOOK_PARENT_NAMES.recto)
  if (!recto) throw new Error('Expected the built-in recto parent page.')
  recto.head = '<div class="segnavia-running-head" DATA-MOTIF=segnavia:running-head></div>'
  recto.margin = { top: 21, bottom: 22, inner: 23, outer: 24 }
  const pages: BookPrintedPagePlan[] = [{ index: 0, role: 'recto', parent: BOOK_PARENT_NAMES.recto, side: 'right', folio: '7', runningHead: 'Heading' }]

  const html = marginDocument(book, pages, parents)
  const css = marginCss(book, pages, parents)
  expect(html).toContain('<div class="segnavia-running-head"><bdi dir="ltr">Heading</bdi></div>')
  expect(html).toContain('<div class="segnavia-folio"><bdi dir="ltr">7</bdi></div>')
  expect(css).toContain('block-size:21mm;inset-inline-start:23mm;inset-inline-end:24mm')
  expect(css).toContain('block-size:22mm;inset-inline-start:23mm;inset-inline-end:24mm')
  expect(html).not.toContain('data-motif')
})
