import { describe, expect, test } from 'bun:test'
import { bookDocument, parseBookFixture } from '@segnavia/html'
import { type PDFArray, type PDFDict, PDFDocument, PDFHexString, PDFName, type PDFNumber, PDFRef } from 'pdf-lib'
import type { BookDestination } from './book-destinations.ts'
import { bookOutline, outlineTitle, writeBookStructure, writePlanFolios } from './book-structure.ts'

const at = (page: number): BookDestination => ({ page, x: 0, y: 700 })

describe('book outline policy', () => {
  test('nests under the nearest earlier lower level', () => {
    const headings = [
      { id: 'one', level: 1, text: 'One', sectionId: 'one' },
      { id: 'deep', level: 3, text: 'Deep', sectionId: 'one' },
      { id: 'middle', level: 2, text: 'Middle', sectionId: 'one' },
      { id: 'two', level: 1, text: 'Two', sectionId: 'two' },
    ]
    const destinations = new Map(headings.map((heading, index) => [heading.id, at(index + 1)]))
    expect(bookOutline(headings, destinations)).toEqual([
      {
        id: 'one',
        title: 'One',
        destination: at(1),
        children: [
          { id: 'deep', title: 'Deep', destination: at(2), children: [] },
          { id: 'middle', title: 'Middle', destination: at(3), children: [] },
        ],
      },
      { id: 'two', title: 'Two', destination: at(4), children: [] },
    ])
  })

  test('keeps a Hebrew title unmarked in the pure outline tree', () => {
    expect(bookOutline([{ id: 'one', level: 1, text: 'Introduction שלום', sectionId: 'one' }], new Map([['one', at(1)]]))[0]?.title).toBe('Introduction שלום')
  })

  test('uses the contents label as the bookmark title', () => {
    expect(
      bookOutline([{ id: 'one', level: 1, text: 'Full title', contentsLabel: 'Short label', sectionId: 'one' }], new Map([['one', at(1)]]))[0]?.title,
    ).toBe('Short label')
  })

  test('uses contents depth and excludes opted-out headings', () => {
    const book = parseBookFixture({
      title: 'Book',
      mode: 'continuous',
      contents: { depth: 2 },
      chapters: [{ id: 'body-section', title: 'One', html: '<h2 id="kept">Kept</h2><h2 id="excluded" data-contents="exclude">No</h2><h3 id="deep">Deep</h3>' }],
    })
    const built = bookDocument(book)
    expect(built.headings.map((heading) => heading.id)).toEqual(['body-section', 'kept'])
    const destinations = new Map(built.headings.map((heading, index) => [heading.id, at(index + 1)]))
    expect(bookOutline(built.headings, destinations)[0]?.children.map((item) => item.id)).toEqual(['kept'])
  })

  test('omits the headings of a contents-disabled section', () => {
    const book = parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      chapters: [
        { id: 'hidden-section', kind: 'designed', title: 'Hidden', contents: false, pages: [{ html: '<h1 id="hidden-heading">Hidden heading</h1>' }] },
        { id: 'visible-section', title: 'Visible', html: '<h2 id="visible-heading">Visible heading</h2>' },
      ],
    })
    const built = bookDocument(book)
    const destinations = new Map(built.headings.map((heading, index) => [heading.id, at(index + 1)]))

    expect(bookOutline(built.headings, destinations).map((item) => item.id)).toEqual(['visible-section'])
    expect(bookOutline(built.headings, destinations)[0]?.children.map((item) => item.id)).toEqual(['visible-heading'])
  })

  test('refuses a heading without a printed destination and names its id', () => {
    expect(() => bookOutline([{ id: 'missing', level: 1, text: 'Missing', sectionId: 'one' }], new Map())).toThrow(
      'The heading missing has no printed destination.',
    )
  })
})

test('direction marks appear only when natural and resolved directions differ', () => {
  expect(outlineTitle('שלום', 'rtl')).toBe('שלום')
  expect(outlineTitle('Introduction שלום', 'rtl')).toBe('\u200fIntroduction שלום')
  expect(outlineTitle('שלום', 'ltr')).toBe('\u200eשלום')
  expect(outlineTitle('Introduction', 'ltr')).toBe('Introduction')
  expect(outlineTitle('1948', 'rtl')).toBe('\u200f1948')
  expect(outlineTitle('1948', 'ltr')).toBe('1948')
})

test('writes plan folios as PDF page labels, including an uncounted page', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  document.addPage()
  document.addPage()
  writePlanFolios(document, [null, 'i', 'ii'])
  const labels = document.catalog.lookup(PDFName.of('PageLabels')) as PDFDict
  const numbers = labels.lookup(PDFName.of('Nums')) as PDFArray
  expect((numbers.lookup(1) as PDFDict).lookup(PDFName.of('P'), PDFHexString).decodeText()).toBe('')
  expect((numbers.lookup(3) as PDFDict).lookup(PDFName.of('P'), PDFHexString).decodeText()).toBe('i')
  expect((numbers.lookup(5) as PDFDict).lookup(PDFName.of('P'), PDFHexString).decodeText()).toBe('ii')
})

test('the PDF adapter infers one direction from the title for outlines and metadata', async () => {
  const book = parseBookFixture({
    title: 'ספר',
    authors: ['אחת', 'Two'],
    subject: 'נושא',
    mode: 'continuous',
    chapters: [{ title: 'פרק', html: '<p>Text</p>' }],
  })
  const document = await PDFDocument.create()
  document.addPage([400, 700])
  writeBookStructure(document, {
    book,
    headings: [
      { id: 'chapter', level: 1, text: 'פרק', sectionId: 'chapter' },
      { id: 'topic', level: 2, text: 'Latin topic', sectionId: 'chapter' },
    ],
    destinations: new Map([
      ['chapter', at(1)],
      ['topic', at(1)],
    ]),
  })
  const resolve = (value: unknown) => (value instanceof PDFRef ? document.context.lookup(value) : value)
  const outlines = resolve(document.catalog.get(PDFName.of('Outlines'))) as PDFDict
  const chapter = resolve(outlines.get(PDFName.of('First'))) as PDFDict
  const topic = resolve(chapter.get(PDFName.of('First'))) as PDFDict
  const chapterTitle = chapter.get(PDFName.of('Title')) as PDFHexString
  const topicTitle = topic.get(PDFName.of('Title')) as PDFHexString

  expect(document.getTitle()).toBe('ספר')
  expect(document.getAuthor()).toBe('אחת; \u200fTwo')
  expect(document.getSubject()).toBe('נושא')
  expect(document.catalog.get(PDFName.of('PageMode'))).toEqual(PDFName.of('UseOutlines'))
  expect((chapter.get(PDFName.of('Count')) as PDFNumber).asNumber()).toBe(-1)
  expect(chapterTitle.decodeText()).toBe('פרק')
  expect(topicTitle.decodeText()).toBe('\u200fLatin topic')
  expect([...chapterTitle.asBytes()].slice(0, 2)).toEqual([0xfe, 0xff])
  expect([...topicTitle.asBytes()].slice(0, 2)).toEqual([0xfe, 0xff])
})
