import { expect, test } from 'bun:test'
import { Buffer } from 'node:buffer'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildGrayProfile, buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { drawCropMarks } from '../pdf-marks.ts'
import { inspectPressPdf, rewritePressPdf } from './adapter.ts'

const cmykProfile = buildPressProfile('mft1')
const grayProfile = buildGrayProfile('trc-gamma')

async function pageContent(bytes: Uint8Array, pageIndex = 0): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(pageIndex).node.Contents()
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

function registrationSpace(document: PDFDocument) {
  return document.context.obj([
    'Separation',
    'All',
    'DeviceCMYK',
    document.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [1, 1, 1, 1], N: 1 }),
  ])
}

test('a CMYK press keeps Separation All under a resource name other than All', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ ColorSpace: { CS1: registrationSpace(document) } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/CS1 CS 1 SCN')))
  const converted = await rewritePressPdf(await document.save(), cmykProfile)
  const text = await pageContent(converted.bytes)
  expect(text).toMatch(/\/CS1\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
})

test('a CMYK press refuses a resource named All that is not Separation All', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ ColorSpace: { All: 'DeviceRGB' } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/All CS 1 SCN')))
  await expect(rewritePressPdf(await document.save(), cmykProfile)).rejects.toThrow(/CS operator/)
})

test('a CMYK press keeps All selected in one content stream and used in the next', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ ColorSpace: { All: registrationSpace(document) } }))
  const select = document.context.register(document.context.stream('/All CS'))
  const stroke = document.context.register(document.context.stream('1 SCN'))
  page.node.set(PDFName.of('Contents'), document.context.obj([select, stroke]))
  const converted = await rewritePressPdf(await document.save(), cmykProfile)
  const text = await pageContent(converted.bytes)
  expect(text).toMatch(/\/All\s+CS/)
  expect(text).toMatch(/1\s+SCN/)
})

test('a gray press converts All selected in one content stream and used in the next', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ ColorSpace: { All: registrationSpace(document) } }))
  const select = document.context.register(document.context.stream('/All CS'))
  const stroke = document.context.register(document.context.stream('1 SCN'))
  page.node.set(PDFName.of('Contents'), document.context.obj([select, stroke]))
  const converted = await rewritePressPdf(await document.save(), grayProfile)
  const text = await pageContent(converted.bytes)
  expect(text).toMatch(/\b0 G\b/)
  expect(text).not.toMatch(/\/All\s+CS/)
  expect(text).not.toMatch(/\bSCN\b/)
})

test('a gray press converts every stream that shares one registration Resources dictionary', async () => {
  const document = await PDFDocument.create()
  const form = document.context.register(document.context.stream('/All CS 1 SCN', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10] }))
  const resources = document.context.register(
    document.context.obj({
      ColorSpace: { All: registrationSpace(document) },
      XObject: { Fm1: form },
    }),
  )
  for (const content of ['/All CS 1 SCN /Fm1 Do', '/All CS 1 SCN']) {
    const page = document.addPage([10, 10])
    page.node.set(PDFName.of('Resources'), resources)
    page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
  }
  const converted = await rewritePressPdf(await document.save(), grayProfile)
  const output = await PDFDocument.load(converted.bytes)
  for (const index of [0, 1]) {
    const text = await pageContent(converted.bytes, index)
    expect(text).toMatch(/\b0 G\b/)
    expect(text).not.toMatch(/\/All\s+CS/)
    expect(text).not.toMatch(/\bSCN\b/)
  }
  const xObjects = output.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'))
  const formObject = xObjects instanceof PDFDict ? xObjects.get(PDFName.of('Fm1')) : undefined
  const formStream = formObject ? output.context.lookup(formObject) : undefined
  const formText = formStream instanceof PDFRawStream ? new TextDecoder().decode(decodePDFRawStream(formStream).decode()) : ''
  expect(formText).toMatch(/\b0 G\b/)
  expect(formText).not.toMatch(/\/All\s+CS/)
  expect(output.getPage(0).node.Resources()?.lookup(PDFName.of('ColorSpace'))?.toString() ?? '').not.toContain('/All')
  expect(output.getPage(1).node.Resources()?.lookup(PDFName.of('ColorSpace'))?.toString() ?? '').not.toContain('/All')
})
