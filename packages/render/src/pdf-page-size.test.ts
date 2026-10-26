import { expect, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'
import { millimeterPageSize, pagePdfSize, pixelPageSize, setPdfPageSize } from './pdf-page-size.ts'

test('expresses physical page dimensions as exact inches for Chromium', () => {
  expect(pagePdfSize(millimeterPageSize({ width: 210, height: 297 }))).toEqual({
    width: '8.267716535433072in',
    height: '11.692913385826772in',
  })
  expect(pagePdfSize(pixelPageSize({ width: 420, height: 240 }))).toEqual({ width: '4.375in', height: '2.5in' })
})

test('corrects every media box to an origin-zero physical size', async () => {
  const input = await PDFDocument.create()
  input.addPage([100, 200]).setMediaBox(2, 3, 100, 200)
  input.addPage([101, 201])
  const output = await PDFDocument.load(await setPdfPageSize(await input.save(), { width: 99.25, height: 199.75 }))
  expect(output.getPages().map((page) => page.getMediaBox())).toEqual([
    { x: 0, y: 0, width: 99.25, height: 199.75 },
    { x: 0, y: 0, width: 99.25, height: 199.75 },
  ])
})
