import { expect, test } from 'bun:test'
import { PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef, PDFString } from 'pdf-lib'
import { PdfOutlineReadError, readPdfOutline } from './pdf-outline-read.ts'

const key = (value: string) => PDFName.of(value)

async function destinationDocument(): Promise<PDFDocument> {
  const document = await PDFDocument.create()
  const page = document.addPage([300, 400])
  const named = document.context.obj([page.ref, 'XYZ', 11, 222, null])
  document.catalog.set(key('Names'), document.context.obj({ Dests: { Names: [PDFHexString.fromText('named'), named] } }))
  const explicit = document.context.obj({ Title: PDFHexString.fromText('Explicit'), Dest: [page.ref, 'XYZ', 1, 2, null] })
  const namedItem = document.context.obj({ Title: PDFHexString.fromText('Named'), Dest: PDFString.of('named') })
  const action = document.context.obj({ Title: PDFHexString.fromText('Action'), A: { S: 'GoTo', D: PDFString.of('named') } })
  const refs = [explicit, namedItem, action].map((item) => document.context.register(item))
  explicit.set(key('Next'), refs[1] as PDFRef)
  namedItem.set(key('Next'), refs[2] as PDFRef)
  document.catalog.set(key('Outlines'), document.context.obj({ Type: 'Outlines', First: refs[0], Last: refs[2] }))
  return document
}

test('reads explicit, named and GoTo destinations', async () => {
  const outline = readPdfOutline(await destinationDocument())
  expect(outline.map(({ title }) => title)).toEqual(['Explicit', 'Named', 'Action'])
  expect(outline.map(({ destination }) => destination)).toEqual([
    { page: 1, x: 1, y: 2 },
    { page: 1, x: 11, y: 222 },
    { page: 1, x: 11, y: 222 },
  ])
})

test('returns a typed failure for a cycle', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  const item = document.context.obj({ Title: PDFHexString.fromText('Cycle') })
  const reference = document.context.register(item)
  item.set(key('Next'), reference)
  document.catalog.set(key('Outlines'), document.context.obj({ First: reference }))
  expect(() => readPdfOutline(document)).toThrow(PdfOutlineReadError)
  expect(() => readPdfOutline(document)).toThrow('cycle')
})

test('returns a typed failure beyond depth 64', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  let first: PDFRef | undefined
  for (let depth = 65; depth > 0; depth -= 1) {
    const item = document.context.obj({ Title: PDFHexString.fromText(String(depth)), ...(first ? { First: first, Count: PDFNumber.of(1) } : {}) })
    first = document.context.register(item)
  }
  document.catalog.set(key('Outlines'), document.context.obj({ First: first }))
  expect(() => readPdfOutline(document)).toThrow(PdfOutlineReadError)
  expect(() => readPdfOutline(document)).toThrow('64')
})

test('returns a typed failure for a dangling destination', async () => {
  const document = await PDFDocument.create()
  document.addPage()
  const item = document.context.register(document.context.obj({ Title: PDFHexString.fromText('Missing'), Dest: PDFString.of('nowhere') }))
  document.catalog.set(key('Outlines'), document.context.obj({ First: item }))
  expect(() => readPdfOutline(document)).toThrow(PdfOutlineReadError)
  expect(() => readPdfOutline(document)).toThrow('does not resolve')
})
