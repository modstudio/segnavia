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
  recto.regions.head = {
    edge: 'blockStart',
    html: '<div class="segnavia-running-head" DATA-MOTIF=segnavia:head-template data-motif-name="segnavia:running-head"></div>',
  }
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
  expect(css).toContain('[data-segnavia-region="head"]){top:0mm;left:23mm;width:101mm;height:21mm')
  expect(css).toContain('[data-segnavia-region="foot"]){top:188mm;left:23mm;width:101mm;height:22mm')
  expect(css).toContain('.segnavia-folio){justify-content:flex-end')
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
  expect(css).toContain('.segnavia-margin-page:nth-of-type(1) [data-segnavia-region="head"]){top:0mm;left:5mm;width:113mm;height:10mm')
  expect(css).toContain('.segnavia-margin-page:nth-of-type(2) [data-segnavia-region="head"]){top:0mm;left:30mm;width:113mm;height:10mm')
  expect(css).toContain('.segnavia-margin-page:nth-of-type(1) .segnavia-folio){justify-content:flex-start')
  expect(css).toContain('.segnavia-margin-page:nth-of-type(2) .segnavia-folio){justify-content:flex-end')
})

test('escapes a parent name as one margin-document attribute', () => {
  const book = parseBookFixture({
    title: 'A Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 11, inlineStart: 12, inlineEnd: 13 } },
    chapters: [{ title: 'One', html: '<p>Text</p>' }],
  })
  const parent = { name: 'a"b<c', regions: { head: { edge: 'blockStart' as const, html: '<p>Head</p>' } } }
  const pages: BookPrintedPagePlan[] = [{ index: 0, role: 'recto', parent: parent.name, face: 'recto', side: 'right', folio: '1' }]

  const html = marginDocument(book, pages, [parent])
  expect(html).toContain('data-segnavia-parent="a&quot;b&lt;c"')
  expect(html.match(/data-segnavia-parent=/g)).toHaveLength(1)
})
