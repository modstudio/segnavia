import { expect, test } from 'bun:test'
import { inflateSync } from 'node:zlib'
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib'
import { decodeContent } from '../press/pdf-objects.ts'
import { rewriteEffectsPdf } from './adapter.ts'
import { hoistBackdropRasters } from './hoist.ts'
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

function blendText(document: PDFDocument) {
  return document.context.register(
    document.context.stream('1 .91 .36 rg BT /F 12 Tf 0 0 Td (A) Tj ET', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true },
      Resources: {},
    }),
  )
}

const glassGroup = { Type: 'Group', S: 'Transparency', CS: 'DeviceRGB', I: true } as const

async function capturedBlendDocument(): Promise<{ contents: PDFRawStream; document: PDFDocument; glass: PDFRawStream; text: PDFRawStream }> {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream('q 0 0 10 10 re W n 3 0 0 3 0 0 cm /Raster Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Raster: image, Text: text } },
    }),
  )
  const contentsRef = document.context.register(document.context.stream('1 0 0 rg 0 0 10 10 re f /Glass Do'))
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), contentsRef)
  const glassStream = document.context.lookup(glass)
  const textStream = document.context.lookup(text)
  const contents = document.context.lookup(contentsRef)
  if (!(glassStream instanceof PDFRawStream) || !(textStream instanceof PDFRawStream) || !(contents instanceof PDFRawStream)) {
    throw new Error('Expected form streams')
  }
  return { contents, document, glass: glassStream, text: textStream }
}

async function capturedBlendPdf(): Promise<Uint8Array> {
  return (await capturedBlendDocument()).document.save()
}

function decode(document: PDFDocument, object: unknown): string {
  const stream = object instanceof PDFRef ? document.context.lookup(object) : object
  if (!(stream instanceof PDFRawStream)) return ''
  const filter = stream.dict.get(PDFName.of('Filter'))?.toString()
  const bytes = filter === '/FlateDecode' ? inflateSync(stream.contents) : stream.contents
  return new TextDecoder().decode(bytes)
}

function expectOrder(content: string, parts: readonly string[]): void {
  let at = 0
  for (const part of parts) {
    const found = content.indexOf(part, at)
    expect(found).toBeGreaterThan(-1)
    at = found + part.length
  }
}

function formNamed(document: PDFDocument, name: string): PDFRawStream {
  const resources = document.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
  const object = resources?.get(PDFName.of(name))
  const stream = object ? document.context.lookup(object) : undefined
  if (!(stream instanceof PDFRawStream)) throw new Error(`Expected the ${name} form`)
  return stream
}

function hoistedFrost(document: PDFDocument): PDFRawStream {
  const resources = document.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
  const backdropName = [...(resources?.entries() ?? [])].find(([name]) => name.toString().startsWith('/SegnaviaBackdrop'))?.[1]
  const backdrop = backdropName ? document.context.lookup(backdropName) : undefined
  if (!(backdrop instanceof PDFRawStream)) throw new Error('Expected the hoisted frost')
  return backdrop
}

test('hoists a captured raster painted before Screen out of the glass group', async () => {
  const rewritten = await rewriteEffectsPdf(await capturedBlendPdf())
  const output = await PDFDocument.load(rewritten.bytes)
  const pageContent = decode(output, output.getPage(0).node.Contents())
  expect(pageContent).toContain('Do /Glass Do')
  expect(pageContent).toMatch(/\/SegnaviaBackdrop\d+ Do \/Glass Do/)
  const glass = formNamed(output, 'Glass')
  const glassContent = decode(output, glass)
  expect(glassContent).not.toContain('/Raster Do')
  expect(glassContent).toContain('/Text Do')
  expect(glass.dict.lookup(PDFName.of('Group'), PDFDict).get(PDFName.of('I'))?.toString()).toBe('true')
  expectOrder(decode(output, hoistedFrost(output)), ['0 0 10 10 re W', '3 0 0 3 0 0 cm', 'Do'])
})

test('hoists only the tagged image from a nested form, leaving the fill and reproducing the clip', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const frost = document.context.register(
    document.context.stream('q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do Q q 1 1 0 rg 0 0 10 10 re f Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { XObject: { Raster: image } },
    }),
  )
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream('q 0 0 m 10 0 l 10 10 l 0 10 l h W n /Frost Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
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
  const glassForm = formNamed(output, 'Glass')
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
  expectOrder(decode(output, hoistedFrost(output)), ['0 0 m', '10 0 l', 'h W', '0 0 10 10 re W', '2 0 0 2 1 0 cm', 'Do'])
})

test('does not hoist a captured raster when the group has no non-Normal blend', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const form = document.context.register(
    document.context.stream('/Raster Do', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
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

test('does not hoist when the image frame holds other paint', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const frost = document.context.register(
    document.context.stream('q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do 1 1 0 rg 0 0 10 10 re f Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { XObject: { Raster: image } },
    }),
  )
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream('q 0 0 m 10 0 l 10 10 l 0 10 l h W n /Frost Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Frost: frost, Text: text } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Glass Do')))
  const rewritten = await rewriteEffectsPdf(await document.save())
  const output = await PDFDocument.load(rewritten.bytes)
  expect(decode(output, output.getPage(0).node.Contents())).not.toContain('SegnaviaBackdrop')
  const frostObject = formNamed(output, 'Glass').dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('XObject'), PDFDict).get(PDFName.of('Frost'))
  const frostForm = frostObject ? output.context.lookup(frostObject) : undefined
  expect(frostForm).toBeInstanceOf(PDFRawStream)
  if (!(frostForm instanceof PDFRawStream)) throw new Error('Expected the nested form')
  expect(decode(output, frostForm)).toContain('/Raster Do')
  expect(decode(output, frostForm)).toContain('re f')
  expect(frostForm.dict.has(PDFName.of('Group'))).toBe(true)
})

test('bakes a nested form Matrix as cm in the frost', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const frost = document.context.register(
    document.context.stream('q 0 0 10 10 re W n /Raster Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Matrix: [2, 0, 0, 2, 5, 5],
      Group: glassGroup,
      Resources: { XObject: { Raster: image } },
    }),
  )
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream('q 0 0 m 10 0 l 10 10 l 0 10 l h W n /Frost Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Frost: frost, Text: text } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Glass Do')))
  const rewritten = await rewriteEffectsPdf(await document.save())
  const output = await PDFDocument.load(rewritten.bytes)
  const frostContent = decode(output, hoistedFrost(output))
  expect(frostContent).toContain('2 0 0 2 5 5 cm')
  expectOrder(frostContent, ['0 0 m', '10 0 l', 'h W', '2 0 0 2 5 5 cm', '0 0 10 10 re W', 'Do'])
})

test('emits clip after cm when the source cm preceded the path', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream('q 3 0 0 3 0 0 cm 0 0 10 10 re W n /Raster Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Raster: image, Text: text } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Glass: glass } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Glass Do')))
  const rewritten = await rewriteEffectsPdf(await document.save())
  const output = await PDFDocument.load(rewritten.bytes)
  const frostContent = decode(output, hoistedFrost(output))
  expect(frostContent).toContain('3 0 0 3 0 0 cm')
  expectOrder(frostContent, ['3 0 0 3 0 0 cm', '0 0 10 10 re W', 'Do'])
})

test('leaves a group whose parent has no XObject resources unchanged', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const text = blendText(document)
  const glass = document.context.register(
    document.context.stream('q 0 0 10 10 re W n 3 0 0 3 0 0 cm /Raster Do Q q /Blend gs /Text Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Group: glassGroup,
      Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Raster: image, Text: text } },
    }),
  )
  const parent = document.context.register(
    document.context.stream('/Glass Do', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: { ExtGState: { Dummy: { Type: 'ExtGState', BM: 'Normal' } } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { Parent: parent, Glass: glass } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Parent Do')))
  const glassStream = document.context.lookup(glass)
  if (!(glassStream instanceof PDFRawStream)) throw new Error('Expected the glass form')
  const original = Uint8Array.from(glassStream.contents)
  expect(hoistBackdropRasters(document, { decodedBytes: 0 })).toBe(false)
  expect(glassStream.contents).toEqual(original)
  expect(glassStream.dict.has(PDFName.of('Group'))).toBe(true)
  expect(decode(document, glassStream)).toContain('/Raster Do')
})

test('leaves a non-indirect group unchanged', async () => {
  const document = await PDFDocument.create()
  const image = taggedRaster(document)
  const text = blendText(document)
  const glass = document.context.stream('q 0 0 10 10 re W n 3 0 0 3 0 0 cm /Raster Do Q q /Blend gs /Text Do Q', {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 10, 10],
    Group: glassGroup,
    Resources: { ExtGState: { Blend: { BM: 'Screen' } }, XObject: { Raster: image, Text: text } },
  })
  const resources = document.context.obj({ XObject: {} })
  resources.lookup(PDFName.of('XObject'), PDFDict).set(PDFName.of('Glass'), glass)
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), resources)
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Glass Do')))
  const original = Uint8Array.from(glass.contents)
  expect(hoistBackdropRasters(document, { decodedBytes: 0 })).toBe(false)
  expect(glass.contents).toEqual(original)
  expect(glass.dict.has(PDFName.of('Group'))).toBe(true)
  expect(decode(document, glass)).toContain('/Raster Do')
})

test('charges each content stream once against a small document budget', async () => {
  const baseline = await capturedBlendDocument()
  const unique = decodeContent(baseline.glass).byteLength + decodeContent(baseline.text).byteLength + decodeContent(baseline.contents).byteLength
  expect(hoistBackdropRasters(baseline.document, { decodedBytes: 0 })).toBe(true)
  const expected = decode(baseline.document, baseline.document.getPage(0).node.Contents())
  const limited = await capturedBlendDocument()
  expect(hoistBackdropRasters(limited.document, { decodedBytes: 0, decodedByteCeiling: unique * 2 })).toBe(true)
  expect(decode(limited.document, limited.document.getPage(0).node.Contents())).toBe(expected)
  expect(expected).toMatch(/SegnaviaBackdrop/)
})
