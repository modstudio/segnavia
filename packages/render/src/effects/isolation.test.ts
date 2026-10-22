import { expect, test } from 'bun:test'
import { inflateSync } from 'node:zlib'
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib'
import { rewriteEffectsPdf } from './adapter.ts'
import { BACKDROP_RASTER_IMAGE_KEY } from './types.ts'

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 3, 1, 2, 3, 0xff, 0xd9])

function taggedRaster(document: PDFDocument) {
  const imageStream = document.context.stream(jpeg, {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1,
    Height: 1,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
    Filter: 'DCTDecode',
  })
  imageStream.dict.set(PDFName.of(BACKDROP_RASTER_IMAGE_KEY), document.context.obj(true))
  return document.context.register(imageStream)
}

async function capturedBlendPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const text = document.context.register(
    document.context.stream('1 .91 .36 rg BT /F 12 Tf 0 0 Td (A) Tj ET', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: {},
    }),
  )
  const glass = document.context.register(
    document.context.stream('q 0 0 10 10 re W n 3 0 0 3 0 0 cm /Raster Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Raster: image, Text: text } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('1 0 0 rg 0 0 10 10 re f /Glass Do')))
  return document.save()
}

function decode(document: PDFDocument, object: unknown): string {
  const stream = object instanceof PDFRef ? document.context.lookup(object) : object
  if (!(stream instanceof PDFRawStream)) return ''
  const filter = stream.dict.get(PDFName.of('Filter'))?.toString()
  const bytes = filter === '/FlateDecode' ? inflateSync(stream.contents) : stream.contents
  return new TextDecoder().decode(bytes)
}

test('hoists a captured raster painted before Screen out of the glass group', async () => {
  const rewritten = await rewriteEffectsPdf(await capturedBlendPdf())
  const output = await PDFDocument.load(rewritten.bytes)
  const page = output.getPage(0)
  const contents = page.node.Contents()
  const pageContent = decode(output, contents)
  expect(pageContent).toContain('Do /Glass Do')
  expect(pageContent).toMatch(/\/SegnaviaBackdrop\d+ Do \/Glass Do/)
  const resources = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
  const glassObject = resources?.get(PDFName.of('Glass'))
  const glass = glassObject ? output.context.lookup(glassObject) : undefined
  expect(glass).toBeInstanceOf(PDFRawStream)
  if (!(glass instanceof PDFRawStream)) throw new Error('Expected the glass form')
  const glassContent = decode(output, glass)
  expect(glassContent).not.toContain('/Raster Do')
  expect(glassContent).toContain('/Text Do')
  expect(glass.dict.lookup(PDFName.of('Group'), PDFDict).get(PDFName.of('I'))?.toString()).toBe('true')
  const backdropName = [...(resources?.entries() ?? [])].find(([name]) => name.toString().startsWith('/SegnaviaBackdrop'))?.[1]
  const backdrop = backdropName ? output.context.lookup(backdropName) : undefined
  expect(backdrop).toBeInstanceOf(PDFRawStream)
  if (!(backdrop instanceof PDFRawStream)) throw new Error('Expected the hoisted frost')
  const backdropContent = decode(output, backdrop)
  expect(backdropContent).toContain('0 0 10 10 re W')
  expect(backdropContent).toContain('3 0 0 3 0 0 cm')
})

test('hoists only the tagged image from a nested form, leaving the fill and reproducing the clip', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const frost = document.context.register(
    document.context.stream('q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do Q q 1 1 0 rg 0 0 10 10 re f Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: { XObject: { Raster: image } },
    }),
  )
  const text = document.context.register(
    document.context.stream('1 .91 .36 rg BT /F 12 Tf 0 0 Td (A) Tj ET', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: {},
    }),
  )
  const glass = document.context.register(
    document.context.stream('q 0 0 m 10 0 l 10 10 l 0 10 l h W n /Frost Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Frost: frost, Text: text } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Glass Do')))
  const rewritten = await rewriteEffectsPdf(await document.save())
  const output = await PDFDocument.load(rewritten.bytes)
  const pageContent = decode(output, output.getPage(0).node.Contents())
  expect(pageContent).toMatch(/\/SegnaviaBackdrop\d+ Do \/Glass Do/)
  const resources = output.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
  const glassObject = resources?.get(PDFName.of('Glass'))
  const glassForm = glassObject ? output.context.lookup(glassObject) : undefined
  expect(glassForm).toBeInstanceOf(PDFRawStream)
  if (!(glassForm instanceof PDFRawStream)) throw new Error('Expected the glass form')
  const glassContent = decode(output, glassForm)
  expect(glassContent).toContain('/Frost Do')
  expect(glassContent).toContain('/Text Do')
  expect(glassForm.dict.lookup(PDFName.of('Group'), PDFDict).get(PDFName.of('I'))?.toString()).toBe('true')
  const frostObject = glassForm.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('XObject'), PDFDict).get(PDFName.of('Frost'))
  const frostForm = frostObject ? output.context.lookup(frostObject) : undefined
  expect(frostForm).toBeInstanceOf(PDFRawStream)
  if (!(frostForm instanceof PDFRawStream)) throw new Error('Expected the nested form')
  const frostContent = decode(output, frostForm)
  expect(frostContent).not.toContain('/Raster Do')
  expect(frostContent).toContain('re f')
  expect(frostForm.dict.has(PDFName.of('Group'))).toBe(false)
  const backdropName = [...(resources?.entries() ?? [])].find(([name]) => name.toString().startsWith('/SegnaviaBackdrop'))?.[1]
  const backdrop = backdropName ? output.context.lookup(backdropName) : undefined
  expect(backdrop).toBeInstanceOf(PDFRawStream)
  if (!(backdrop instanceof PDFRawStream)) throw new Error('Expected the hoisted frost')
  const backdropContent = decode(output, backdrop)
  expect(backdropContent).toContain('0 0 m')
  expect(backdropContent).toContain('10 0 l')
  expect(backdropContent).toContain('0 0 10 10 re W')
  expect(backdropContent).toContain('2 0 0 2 1 0 cm')
  expect(backdropContent).toMatch(/Do/)
})

test('does not hoist a captured raster when the group has no non-Normal blend', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const form = document.context.register(
    document.context.stream('/Raster Do', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: { XObject: { Raster: image } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Form: form } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Form Do')))
  const rewritten = await rewriteEffectsPdf(await document.save())
  const output = await PDFDocument.load(rewritten.bytes)
  const contents = output.getPage(0).node.Contents()
  expect(decode(output, contents)).toContain('/Form Do')
  expect(decode(output, contents)).not.toContain('SegnaviaBackdrop')
})
