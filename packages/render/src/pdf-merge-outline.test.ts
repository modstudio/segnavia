import { expect, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'
import { writeOutlineNodes } from './book-structure.ts'
import { combinedPdfOutline } from './pdf-merge-outline.ts'
import { readPdfOutline } from './pdf-outline-read.ts'

const child = {
  title: '\u200fפרק',
  destination: { page: 1, x: 4, y: 300 },
  open: true,
  children: [{ title: 'Nested', destination: { page: 1, x: 8, y: 200 }, open: true, children: [] }],
}

test('combines parts in order under collapsed entries and shifts nested destinations', () => {
  const outline = combinedPdfOutline(
    [
      { heading: { text: 'First', mark: false }, outline: [child], pageOffset: 0, firstPageHeight: 400 },
      { heading: { text: 'Host second', mark: true }, outline: [], pageOffset: 2, firstPageHeight: 500 },
    ],
    'ltr',
  )
  expect(outline.map(({ title }) => title)).toEqual(['First', 'Host second'])
  expect(outline.map(({ open }) => open)).toEqual([false, false])
  expect(outline[0]?.children[0]?.title).toBe(child.title)
  expect(outline[0]?.children[0]?.children[0]?.title).toBe('Nested')
  expect(outline[1]?.children).toEqual([])
  expect(outline[1]?.destination?.page).toBe(3)
  expect(outline[1]?.destination?.y).toBe(500)
})

test('marks a Hebrew host label against the merged direction', () => {
  const part = { heading: { text: 'עברית', mark: true }, outline: [], pageOffset: 0, firstPageHeight: 400 }
  const english = combinedPdfOutline([part], 'ltr')
  const hebrew = combinedPdfOutline([part], 'rtl')
  expect(english[0]?.title).toBe('\u200eעברית')
  expect(english[0]?.title.match(/^[\u200e\u200f]+/)?.[0]).toBe('\u200e')
  expect(hebrew[0]?.title).toBe('עברית')
})

test('writer round-trips nesting, destinations, open state and stored title marks', async () => {
  const document = await PDFDocument.create()
  document.addPage([300, 400])
  document.addPage([300, 400])
  document.addPage([300, 400])
  const outline = combinedPdfOutline([{ heading: { text: 'First', mark: false }, outline: [child], pageOffset: 1, firstPageHeight: 400 }], 'ltr')
  writeOutlineNodes(document, outline)
  expect(readPdfOutline(await PDFDocument.load(await document.save()))).toEqual(outline)
})
