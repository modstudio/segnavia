import { describe, expect, test } from 'bun:test'
import { Book } from '@segnavia/format'
import { bookDocument } from '@segnavia/html'
import { type PDFDict, PDFDocument, type PDFHexString, PDFName, type PDFNumber, PDFRef } from 'pdf-lib'
import type { BookDestination } from './book-destinations.ts'
import { bookOutline, bookXmp, outlineTitle, writeBookStructure } from './book-structure.ts'

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
    expect(bookOutline(headings, destinations, {})).toEqual([
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

  test('uses contents depth and excludes opted-out headings', () => {
    const book = Book.parse({
      title: 'Book',
      mode: 'continuous',
      contents: { depth: 2 },
      chapters: [{ title: 'One', html: '<h2 id="kept">Kept</h2><h2 id="excluded" data-contents="exclude">No</h2><h3 id="deep">Deep</h3>' }],
    })
    const built = bookDocument(book)
    expect(built.headings.map((heading) => heading.id)).toEqual(['segnavia-chapter-1', 'kept'])
    const destinations = new Map(built.headings.map((heading, index) => [heading.id, at(index + 1)]))
    expect(bookOutline(built.headings, destinations, book)[0]?.children.map((item) => item.id)).toEqual(['kept'])
  })

  test('refuses a heading without a printed destination and names its id', () => {
    expect(() => bookOutline([{ id: 'missing', level: 1, text: 'Missing', sectionId: 'one' }], new Map(), {})).toThrow(
      'The heading missing has no printed destination.',
    )
  })
})

test('XMP escapes metadata and keeps Hebrew and ordered authors', () => {
  const xmp = bookXmp({ title: 'ספר & <book>', authors: ['Ada & Bob', 'דוד "לוי"'], subject: "One's > two", lang: 'he' })
  expect(xmp).toContain('<rdf:li xml:lang="x-default">ספר &amp; &lt;book&gt;</rdf:li>')
  expect(xmp).toContain('<rdf:li xml:lang="he">ספר &amp; &lt;book&gt;</rdf:li>')
  expect(xmp).toContain('<rdf:Seq><rdf:li>Ada &amp; Bob</rdf:li><rdf:li>דוד &quot;לוי&quot;</rdf:li></rdf:Seq>')
  expect(xmp).toContain('One&apos;s &gt; two')
})

test('direction marks appear only when natural and resolved directions differ', () => {
  expect(outlineTitle('שלום', undefined, 'he')).toBe('שלום')
  expect(outlineTitle('Introduction שלום', undefined, 'he')).toBe('\u200fIntroduction שלום')
  expect(outlineTitle('שלום', undefined, 'en')).toBe('\u200eשלום')
  expect(outlineTitle('Introduction', undefined, 'en')).toBe('Introduction')
})

test('the PDF adapter writes collapsed UTF-16 outlines and document metadata', async () => {
  const book = Book.parse({
    title: 'ספר',
    authors: ['אחת', 'Two'],
    subject: 'נושא',
    lang: 'he',
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
    offset: 0,
  })
  const resolve = (value: unknown) => (value instanceof PDFRef ? document.context.lookup(value) : value)
  const outlines = resolve(document.catalog.get(PDFName.of('Outlines'))) as PDFDict
  const chapter = resolve(outlines.get(PDFName.of('First'))) as PDFDict
  const topic = resolve(chapter.get(PDFName.of('First'))) as PDFDict
  const chapterTitle = chapter.get(PDFName.of('Title')) as PDFHexString
  const topicTitle = topic.get(PDFName.of('Title')) as PDFHexString

  expect(document.getTitle()).toBe('ספר')
  expect(document.getAuthor()).toBe('אחת; Two')
  expect(document.getSubject()).toBe('נושא')
  expect((document.catalog.get(PDFName.of('Lang')) as PDFHexString).decodeText()).toBe('he')
  expect(document.catalog.get(PDFName.of('PageMode'))).toEqual(PDFName.of('UseOutlines'))
  expect((chapter.get(PDFName.of('Count')) as PDFNumber).asNumber()).toBe(-1)
  expect(chapterTitle.decodeText()).toBe('פרק')
  expect(topicTitle.decodeText()).toBe('\u200fLatin topic')
  expect([...chapterTitle.asBytes()].slice(0, 2)).toEqual([0xfe, 0xff])
  expect([...topicTitle.asBytes()].slice(0, 2)).toEqual([0xfe, 0xff])
})
