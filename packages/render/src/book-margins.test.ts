import { expect, test } from 'bun:test'
import { BOOK_PARENT_NAMES, bookParentPages } from '@segnavia/format'
import { type BookPrintedPagePlan, parseBookFixture } from '@segnavia/html'
import { bookPlanFolios } from '@segnavia/layout'
import { continuousMarginVariableValues, marginFactsFor } from './book-margin-facts.ts'
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
  expect(html).not.toMatch(/data-segnavia-region=[^>]+\sdir=/)
  expect(html).toContain('<div class="segnavia-running-head"><bdi dir="ltr">Heading</bdi></div>')
  expect(html).toContain('<div class="segnavia-folio"><bdi dir="ltr">7</bdi></div>')
  expect(css).toContain('[data-segnavia-region="head"]){top:0mm;left:23mm;width:101mm;height:21mm')
  expect(css).toContain('[data-segnavia-region="foot"]){top:188mm;left:23mm;width:101mm;height:22mm')
  expect(css).toContain('.segnavia-folio){text-align:right')
  expect(html).not.toContain('data-motif')
})

test('resolves chapter-number on the server margin path', () => {
  const facts = marginFactsFor(
    [{ id: 'chapter', kind: 'chapter', division: 'body', number: '4' }],
    new Map([['chapter', { page: 1, x: 0, y: 0 }]]),
    1,
    new Set(),
    { system: 'arabic', printed: true },
    [{ name: 'chapter', kind: 'text', from: 'chapter-number', pick: 'first' }],
  )
  expect(facts[0]?.variables?.chapter).toBe('4')
})

test('agrees with the layout numbering totals for roman front matter and a Hebrew body', () => {
  const pages = [
    { sequence: 'front', flow: 'preface', blank: false },
    { sequence: 'front', flow: 'preface', blank: false },
    { sequence: 'body', flow: 'chapter', blank: false },
    { sequence: 'body', flow: 'chapter', blank: false },
  ]
  const plan = bookPlanFolios(pages, { frontMatter: 'roman-lower', body: 'hebrew' })
  const variable = [{ name: 'run-total', kind: 'pages' as const, of: 'numbering' as const }]
  const front = marginFactsFor(
    [{ id: 'preface', kind: 'front', division: 'front' }],
    new Map([['preface', { page: 1, x: 0, y: 0 }]]),
    2,
    new Set(),
    { system: 'roman-lower', printed: true },
    variable,
  )
  const body = marginFactsFor(
    [{ id: 'chapter', kind: 'chapter', division: 'body' }],
    new Map([['chapter', { page: 1, x: 0, y: 0 }]]),
    2,
    new Set(),
    { system: 'hebrew', printed: true },
    variable,
  )

  const totals = [...front, ...body].map((page) => page.variables?.['run-total'])
  expect(totals).toEqual(['ii', 'ii', 'ב', 'ב'])
  expect(totals).toEqual(plan.numberingTotals)
})

test('resolves content variables from ordered continuous-page set points', () => {
  const sections = [{ id: 'chapter', kind: 'chapter' as const, division: 'body' as const }]
  const pages = [
    { flow: 'chapter', blank: false, counted: true, record: false },
    { flow: 'chapter', blank: false, counted: true, record: false },
    { flow: 'chapter', blank: false, counted: true, record: false },
  ]
  const variables = [{ name: 'topic', kind: 'text' as const, from: 'content' as const, pick: 'first' as const }]
  const points = [
    { id: 'one', name: 'topic', value: 'Three Phases', section: 'chapter', page: 1, y: 700, atStart: true },
    { id: 'two', name: 'topic', value: 'Practice', section: 'chapter', page: 2, y: 600, atStart: false },
    { id: 'three', name: 'topic', value: 'Questioning', section: 'chapter', page: 3, y: 650, atStart: false },
  ]
  const facts = marginFactsFor(
    sections,
    new Map([['chapter', { page: 1, x: 0, y: 700 }]]),
    3,
    new Set(),
    { system: 'arabic', printed: true },
    variables,
    undefined,
    {},
    undefined,
    continuousMarginVariableValues(pages, variables, points),
  )
  expect(facts.map((page) => page.variables?.topic)).toEqual(['Three Phases', 'Practice', 'Questioning'])
})

test('orders continuous content set points from the top of a page', () => {
  const pages = [{ flow: 'chapter', blank: false, counted: true, record: false }]
  const points = [
    { id: 'lower', name: 'topic', value: 'Lower', section: 'chapter', page: 1, y: 400, atStart: false },
    { id: 'upper', name: 'topic', value: 'Upper', section: 'chapter', page: 1, y: 700, atStart: true },
  ]

  expect(
    (['first', 'last', 'start'] as const).map(
      (pick) => continuousMarginVariableValues(pages, [{ name: 'topic', kind: 'text', from: 'content', pick }], points)[0]?.topic,
    ),
  ).toEqual(['Upper', 'Lower', 'Upper'])
})

test('carries a front-matter content variable into the body', () => {
  const pages = [
    { flow: 'preface', blank: false, counted: true, record: false },
    { flow: 'chapter', blank: false, counted: true, record: false },
  ]
  const values = continuousMarginVariableValues(
    pages,
    [{ name: 'topic', kind: 'text', from: 'content', pick: 'first' }],
    [{ id: 'front-topic', name: 'topic', value: 'Preface topic', section: 'preface', page: 1, y: 700, atStart: false }],
  )

  expect(values.map((page) => page.topic)).toEqual(['Preface topic', 'Preface topic'])
})

test('leaves chapter-number empty on a part opening page', () => {
  const facts = marginFactsFor(
    [{ id: 'part', kind: 'part', division: 'body', partNumbers: { gate: 'II' } }],
    new Map([['part', { page: 1, x: 0, y: 0 }]]),
    1,
    new Set(),
    { system: 'arabic', printed: true },
    [
      { name: 'chapter', kind: 'text', from: 'chapter-number', pick: 'first' },
      { name: 'part', kind: 'text', from: 'part-number', part: 'gate', pick: 'first' },
    ],
  )
  expect(facts[0]?.variables?.chapter).toBeUndefined()
  expect(facts[0]?.variables?.part).toBe('II')
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
  expect(css).toContain('.segnavia-margin-page:nth-of-type(1) .segnavia-folio){text-align:left')
  expect(css).toContain('.segnavia-margin-page:nth-of-type(2) .segnavia-folio){text-align:right')
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
