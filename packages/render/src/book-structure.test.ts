import { expect, test } from 'bun:test'
import { parseBookFixture } from '@segnavia/html'
import { type PDFArray, type PDFDict, PDFDocument, PDFHexString, PDFName, type PDFNumber, PDFRef } from 'pdf-lib'
import type { BookDestination } from './book-destinations.ts'
import { outlineTitle, writeDocumentStructure, writePlanFolios } from './book-structure.ts'

const at = (page: number): BookDestination => ({ page, x: 0, y: 700 })

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
  writeDocumentStructure(document, {
    metadata: book,
    source: {
      direction: 'rtl',
      depth: 6,
      blocks: ['chapter', 'topic'],
      headings: [
        { id: 'chapter', block: 'chapter', level: 1, title: 'פרק', listed: { contents: true, outline: true } },
        { id: 'topic', block: 'topic', level: 2, title: 'Latin topic', listed: { contents: true, outline: true } },
      ],
    },
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
