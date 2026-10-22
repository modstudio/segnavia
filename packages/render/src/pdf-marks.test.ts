import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { drawCropMarks } from './pdf-marks.ts'

async function pageContent(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return streams
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
}

test('default crop marks stay RGB black', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 100])
  drawCropMarks(page, [{ start: { x: 10, y: 10 }, end: { x: 20, y: 10 } }], 'black')
  const bytes = await document.save()
  const text = await pageContent(bytes)
  expect(text).toContain('0 0 0 RG')
  expect(text).not.toContain('/All')
  expect(Buffer.from(bytes).toString('latin1')).not.toContain('/Separation')
})

test('registration crop marks use a Separation All stroke', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 100])
  drawCropMarks(page, [{ start: { x: 10, y: 10 }, end: { x: 20, y: 10 } }], 'registration')
  const bytes = await document.save()
  const text = await pageContent(bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
  expect(text).not.toMatch(/\b0 0 0 RG\b/)
  const output = await PDFDocument.load(bytes)
  const spaces = output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'), PDFDict)
  const space = spaces?.lookup(PDFName.of('All'), PDFArray)
  expect(space?.lookup(0, PDFName).toString()).toBe('/Separation')
  expect(space?.lookup(1, PDFName).toString()).toBe('/All')
  expect(space?.lookup(2, PDFName).toString()).toBe('/DeviceCMYK')
  const fn = space?.lookup(3, PDFDict)
  expect(fn?.get(PDFName.of('FunctionType'))?.toString()).toBe('2')
  expect(fn?.lookup(PDFName.of('C0'), PDFArray).asArray().map(String)).toEqual(['0', '0', '0', '0'])
  expect(fn?.lookup(PDFName.of('C1'), PDFArray).asArray().map(String)).toEqual(['1', '1', '1', '1'])
  expect(fn?.get(PDFName.of('N'))?.toString()).toBe('1')
})

test('registration crop marks skip an All resource that is not Separation All', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([100, 100])
  const resources = page.node.normalizedEntries().Resources
  resources.set(PDFName.of('ColorSpace'), document.context.obj({ All: 'DeviceRGB' }))
  drawCropMarks(page, [{ start: { x: 10, y: 10 }, end: { x: 20, y: 10 } }], 'registration')
  const bytes = await document.save()
  const text = await pageContent(bytes)
  expect(text).toMatch(/\/All1\s+CS/)
  expect(text).not.toMatch(/\/All\s+CS/)
  const output = await PDFDocument.load(bytes)
  const spaces = output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'), PDFDict)
  expect(spaces?.get(PDFName.of('All'))?.toString()).toBe('/DeviceRGB')
  const space = spaces?.lookup(PDFName.of('All1'), PDFArray)
  expect(space?.lookup(0, PDFName).toString()).toBe('/Separation')
  expect(space?.lookup(1, PDFName).toString()).toBe('/All')
})
