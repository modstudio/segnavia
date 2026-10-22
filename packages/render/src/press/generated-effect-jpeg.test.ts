import { expect, test } from 'bun:test'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { rewritePressPdf } from './adapter.ts'

test('browser-decodes a generated backdrop JPEG for press conversion without reporting an authored image', async () => {
  const document = await PDFDocument.create()
  const image = document.context.register(
    document.context.stream(Uint8Array.from([1, 2, 3]), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 2,
      Height: 1,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'DCTDecode',
      SegnaviaGeneratedEffect: true,
      SegnaviaBackdropRaster: true,
    }),
  )
  const page = document.addPage([2, 1])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: image } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Glass Do')))
  let decoded = false
  const converted = await rewritePressPdf(await document.save(), buildPressProfile('mft1'), undefined, async () => {
    decoded = true
    return { width: 2, height: 1, rgb: Uint8Array.from([255, 0, 0, 0, 0, 255]) }
  })
  expect(decoded).toBeTrue()
  expect(converted.report.images).toEqual([])
  const output = await PDFDocument.load(converted.bytes)
  const generated = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('SegnaviaBackdropRaster')))
  expect(generated?.dict.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceCMYK')
})
