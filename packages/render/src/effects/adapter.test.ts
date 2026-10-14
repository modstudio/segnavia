import { expect, test } from 'bun:test'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { rewriteEffectsPdf } from './adapter.ts'

async function minimalMask(nested = false): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const image = document.context.register(
    document.context.stream(Uint8Array.of(0, 64, 128, 255), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 2,
      Height: 2,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
    }),
  )
  const nestedMask = document.context.register(document.context.obj({ S: 'Alpha', G: document.context.stream('', { BBox: [0, 0, 1, 1] }) }))
  const form = document.context.register(
    document.context.stream('q 2 0 0 -2 10 22 cm /Coverage Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [10, 20, 12, 22],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceGray', I: true },
      Resources: {
        XObject: { Coverage: image },
        ...(nested ? { ExtGState: { Nested: { SMask: nestedMask } } } : {}),
      },
    }),
  )
  const mask = document.context.register(document.context.obj({ Type: 'Mask', S: 'Luminosity', G: form }))
  const page = document.addPage([30, 30])
  page.node.set(PDFName.of('Resources'), document.context.obj({ ExtGState: { Mask: { SMask: mask }, None: { SMask: 'None' } } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('1 0 0 rg /Mask gs 10 20 2 2 re f /None gs')))
  return document.save()
}

function pageContent(document: PDFDocument): string {
  const contents = document.getPage(0).node.Contents()
  const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return objects
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
}

test('rewrites a grayscale-image luminosity mask as a direct image soft mask', async () => {
  const rewritten = await rewriteEffectsPdf(await minimalMask())
  expect(rewritten.report).toEqual({ rule1: 1, rule2: 0, rule3: 0, rule4: 0, kept: 0 })
  const output = await PDFDocument.load(rewritten.bytes)
  expect(pageContent(output)).toContain('/SegnaviaEffect1 Do')
  expect(pageContent(output)).not.toContain('/Mask gs')
  const images = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')
  const effect = images.find((image) => image.dict.has(PDFName.of('SegnaviaEffectRule')))
  expect(effect?.dict.has(PDFName.of('SMask'))).toBe(true)
  expect(effect?.dict.get(PDFName.of('ColorSpace'))?.toString()).toContain('/Indexed /DeviceRGB')
})

test('keeps nested masks in Chromium form', async () => {
  const rewritten = await rewriteEffectsPdf(await minimalMask(true))
  expect(rewritten.report.rule1).toBe(0)
  expect(rewritten.report.kept).toBe(2)
  expect(pageContent(await PDFDocument.load(rewritten.bytes))).toContain('/Mask gs')
})
