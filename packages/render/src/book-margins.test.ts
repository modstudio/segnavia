import { expect, test } from 'bun:test'
import { BOOK_PARENT_NAMES, bookParentPages } from '@segnavia/format'
import { type BookPrintedPagePlan, parseBookFixture } from '@segnavia/html'
import { marginCss, marginDocument } from './book-margins.ts'

test('fills catalogued furniture by its parsed motif key and uses its resolved parent margin', () => {
  const book = parseBookFixture({
    title: 'A Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 11, inlineStart: 12, inlineEnd: 13 } },
    chapters: [{ title: 'One', html: '<p>Text</p>' }],
  })
  const parents = bookParentPages(book.page?.margin ?? { blockStart: 0, blockEnd: 0, inlineStart: 0, inlineEnd: 0 })
  const recto = parents.find((parent) => parent.name === BOOK_PARENT_NAMES.recto)
  if (!recto) throw new Error('Expected the built-in recto parent page.')
  recto.head = '<div class="segnavia-running-head" DATA-MOTIF=segnavia:head-template data-motif-name="segnavia:running-head"></div>'
  recto.margin = { blockStart: 21, blockEnd: 22, inlineStart: 23, inlineEnd: 24 }
  const pages: BookPrintedPagePlan[] = [
    {
      index: 0,
      role: 'recto',
      parent: BOOK_PARENT_NAMES.recto,
      face: 'recto',
      side: 'right',
      folio: '7',
      variables: { 'segnavia:section-title': 'Heading', 'segnavia:folio': '7' },
    },
  ]

  const html = marginDocument(book, pages, parents)
  const css = marginCss(book, pages, parents)
  expect(html).toContain('data-segnavia-side="recto"')
  expect(html).toContain('<div class="segnavia-running-head"><bdi dir="ltr">Heading</bdi></div>')
  expect(html).toContain('<div class="segnavia-folio"><bdi dir="ltr">7</bdi></div>')
  expect(css).toContain('block-size:21mm;inset-inline-start:23mm;inset-inline-end:24mm')
  expect(css).toContain('block-size:22mm;inset-inline-start:23mm;inset-inline-end:24mm')
  expect(html).not.toContain('data-motif')
})

test('places asymmetric binding margins on the physical spine edges of an RTL book', () => {
  const book = parseBookFixture({
    title: 'ספר',
    mode: 'continuous',
    dir: 'rtl',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 11, inlineStart: 30, inlineEnd: 5 } },
    chapters: [{ title: 'אחד', html: '<p>טקסט</p>' }],
  })
  const parents = bookParentPages(book.page?.margin ?? { blockStart: 0, blockEnd: 0, inlineStart: 0, inlineEnd: 0 })
  const pages: BookPrintedPagePlan[] = [
    { index: 1, role: 'recto', parent: BOOK_PARENT_NAMES.recto, face: 'recto', side: 'left', folio: 'א׳' },
    { index: 2, role: 'verso', parent: BOOK_PARENT_NAMES.verso, face: 'verso', side: 'right', folio: 'ב׳' },
  ]

  const css = marginCss(book, pages, parents)
  expect(css).toContain(
    '.segnavia-margin-page:nth-of-type(1) .segnavia-running-head){inset-block-start:0;block-size:10mm;inset-inline-start:5mm;inset-inline-end:30mm;justify-content:flex-start',
  )
  expect(css).toContain(
    '.segnavia-margin-page:nth-of-type(2) .segnavia-running-head){inset-block-start:0;block-size:10mm;inset-inline-start:30mm;inset-inline-end:5mm;justify-content:flex-end',
  )
})
