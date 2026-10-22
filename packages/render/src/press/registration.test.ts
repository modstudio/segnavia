import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildGrayProfile, buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { drawCropMarks } from '../pdf-marks.ts'
import { inspectPressPdf, rewritePressPdf } from './adapter.ts'

const cmykProfile = buildPressProfile('mft1')
const grayProfile = buildGrayProfile('trc-gamma')

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

async function registrationPdf(): Promise<Uint8Array> {
  const input = await PDFDocument.create()
  drawCropMarks(input.addPage([100, 100]), [{ start: { x: 10, y: 10 }, end: { x: 20, y: 10 } }], 'registration')
  return input.save()
}

test('a CMYK press keeps Separation All registration marks', async () => {
  const converted = await rewritePressPdf(await registrationPdf(), cmykProfile)
  const text = await pageContent(converted.bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
  const output = await PDFDocument.load(converted.bytes)
  expect(output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'))?.toString()).toContain('/Separation /All')
  await expect(inspectPressPdf(converted.bytes)).resolves.toMatchObject({ destination: 'cmyk' })
})

test('a CMYK press still refuses any other Separation', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Spot CS 1 SCN')))
  await expect(rewritePressPdf(await document.save(), cmykProfile)).rejects.toThrow(/CS operator/)
})

test('a gray press converts Separation All registration marks to DeviceGray black', async () => {
  const converted = await rewritePressPdf(await registrationPdf(), grayProfile)
  const text = await pageContent(converted.bytes)
  expect(text).toMatch(/\b0 G\b/)
  expect(text).not.toMatch(/\/All\s+CS/)
  expect(text).not.toMatch(/\bSCN\b/)
  const output = await PDFDocument.load(converted.bytes)
  expect(output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'))?.toString() ?? '').not.toContain('/All')
  expect(Buffer.from(converted.bytes).toString('latin1')).not.toContain('/DeviceCMYK')
  await expect(inspectPressPdf(converted.bytes)).resolves.toMatchObject({ destination: 'gray' })
})
