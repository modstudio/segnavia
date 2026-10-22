import { expect, test } from 'bun:test'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { toPress } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { rewritePressPdf } from './adapter.ts'
import { decodeContent } from './pdf-objects.ts'

const profile = buildPressProfile('mft1')

function setResources(document: PDFDocument, page: ReturnType<PDFDocument['addPage']>, resources: Record<string, unknown>, content: string): void {
  page.node.set(PDFName.of('Resources'), document.context.obj(resources as never))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
}

async function contentText(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return streams
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodeContent(stream)))
    .join('\n')
}

test('converts RGB images to lossless DeviceCMYK only when requested', async () => {
  const document = await PDFDocument.create()
  const mask = document.context.register(
    document.context.stream(Uint8Array.of(128), { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, ColorSpace: 'DeviceGray', BitsPerComponent: 8 }),
  )
  const image = document.context.register(
    document.context.stream(Uint8Array.of(51, 102, 153), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: 1,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      SMask: mask,
    }),
  )
  setResources(document, document.addPage([10, 10]), { XObject: { I: image } }, '/I Do')
  const converted = await rewritePressPdf(await document.save(), profile, 3, undefined, 'convert')
  expect(converted.report.images).toEqual([])
  expect(converted.report.convertedImages).toBe(1)
  const output = await PDFDocument.load(converted.bytes)
  const found = output.context.lookup(image) as PDFRawStream
  expect(found.dict.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceCMYK')
  expect(found.dict.get(PDFName.of('SMask'))?.toString()).toBe(mask.toString())
  expect(found.dict.get(PDFName.of('Filter'))?.toString()).toBe('/FlateDecode')
  expect(found.dict.has(PDFName.of('DecodeParms'))).toBe(true)
  const expected = toPress(readProfile(profile), [0.2, 0.4, 0.6]).map((value) => Math.round(value * 255))
  expect([...decodePDFRawStream(found).decode()].slice(1)).toEqual(expected)
})

test('converts an inline RGB image to DeviceCMYK when requested', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  const prefix = new TextEncoder().encode('BI /W 1 /H 1 /CS /RGB /BPC 8 ID\n')
  const suffix = new TextEncoder().encode('\nEI')
  const content = new Uint8Array(prefix.length + 3 + suffix.length)
  content.set(prefix)
  content.set(Uint8Array.of(51, 102, 153), prefix.length)
  content.set(suffix, prefix.length + 3)
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
  const converted = await rewritePressPdf(await document.save(), profile, 3, undefined, 'convert')
  expect(converted.report.images).toEqual([])
  expect(converted.report.convertedImages).toBe(1)
  expect(await contentText(converted.bytes)).toContain('/CS /CMYK')
})
