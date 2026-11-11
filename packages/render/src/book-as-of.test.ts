import { expect, test } from 'bun:test'
import { parseBookFixture } from '@segnavia/html'
import { PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { renderBookPdf } from './book-pdf.ts'

const fixedDay = { date: '2026-11-14', zone: 'UTC', kind: 'fixed' as const }

async function printedBook() {
  const document = await PDFDocument.create()
  const page = document.addPage([419.53, 595.28])
  document.catalog.set(PDFName.of('Dests'), document.context.obj({ 'body-section': [page.ref, PDFName.of('XYZ'), 0, 595.28, null] }))
  return document.save()
}

const book = () =>
  parseBookFixture({
    title: 'Dated book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    chapters: [{ id: 'body-section', title: 'One', html: '<p>Text</p>' }],
  })

const adapter = {
  print: async () => ({
    bytes: await printedBook(),
    overflow: { part: 'body' as const, pageWidth: 419, extent: 419, clippedStart: 0, clippedEnd: 0, scale: 1, elements: [] },
  }),
  finish: async (pdf: Uint8Array) => pdf,
}

test('a fixed book day writes the PDF creation date', async () => {
  const output = await renderBookPdf(book(), {}, adapter, fixedDay)
  const document = await PDFDocument.load(output, { updateMetadata: false })
  const info = document.context.lookup(document.context.trailerInfo.Info, PDFDict)

  expect(info.lookup(PDFName.of('CreationDate'), PDFString).decodeText()).toBe('D:20261114')
})

test('a current book day without host inputs writes no PDF creation date', async () => {
  const output = await renderBookPdf(book(), {}, adapter, { date: '2026-11-14', zone: 'UTC', kind: 'current' })
  const document = await PDFDocument.load(output, { updateMetadata: false })
  const info = document.context.lookup(document.context.trailerInfo.Info, PDFDict)

  expect(info.has(PDFName.of('CreationDate'))).toBe(false)
})
