import { expect, test } from 'bun:test'
import { inflateSync } from 'node:zlib'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef } from 'pdf-lib'
import { decodeContent } from '../press/pdf-objects.ts'
import { rewriteEffectsDocument, rewriteEffectsPdf } from './adapter.ts'
import { blendText, capturedBlendDocument, capturedBlendPdf, glassGroup, nestedFrostDocument, taggedRaster } from './hoist.test-helper.ts'
import { hoistBackdropRasters } from './hoist.ts'

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

function frostFormOf(output: PDFDocument): PDFRawStream {
  const frostObject = formNamed(output, 'Glass').dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('XObject'), PDFDict).get(PDFName.of('Frost'))
  const frostForm = frostObject ? output.context.lookup(frostObject) : undefined
  if (!(frostForm instanceof PDFRawStream)) throw new Error('Expected the nested form')
  return frostForm
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
  const rewritten = await rewriteEffectsPdf(
    await (await nestedFrostDocument('q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do Q q 1 1 0 rg 0 0 10 10 re f Q')).save(),
  )
  const output = await PDFDocument.load(rewritten.bytes)
  const pageContent = decode(output, output.getPage(0).node.Contents())
  expect(pageContent).toMatch(/\/SegnaviaBackdrop\d+ Do \/Glass Do/)
  const glassForm = formNamed(output, 'Glass')
  const glassContent = decode(output, glassForm)
  expect(glassContent).toContain('/Frost Do')
  expect(glassContent).toContain('/Text Do')
  expect(glassForm.dict.lookup(PDFName.of('Group'), PDFDict).get(PDFName.of('I'))?.toString()).toBe('true')
  const frostForm = frostFormOf(output)
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

test.each([
  ['f', 'q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do 1 1 0 rg 0 0 10 10 re f Q'],
  ['F', 'q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do 1 1 0 rg 0 0 10 10 re F Q'],
  ["'", "q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do (A) ' Q"],
  ['inline image', 'q 0 0 10 10 re W n 2 0 0 2 1 0 cm /Raster Do BI /W 1 /H 1 /CS /RGB /BPC 8 ID\nxxx EI Q'],
])('does not hoist when the image frame holds other paint (%s)', async (_label, frostContent) => {
  const rewritten = await rewriteEffectsPdf(await (await nestedFrostDocument(frostContent)).save())
  const output = await PDFDocument.load(rewritten.bytes)
  expect(decode(output, output.getPage(0).node.Contents())).not.toContain('SegnaviaBackdrop')
  const frostForm = frostFormOf(output)
  expect(decode(output, frostForm)).toContain('/Raster Do')
  expect(frostForm.dict.has(PDFName.of('Group'))).toBe(true)
})

test('hoists Chromium frost frame with color operators beside the tagged image', async () => {
  const { document, glass } = await capturedBlendDocument('q 1093.75 0 0 -875 .25 875.625 cm 0 0 0 RG 0 0 0 rg /G4 gs /Raster Do Q q /Blend gs /Text Do Q')
  glass.dict
    .lookup(PDFName.of('Resources'), PDFDict)
    .lookup(PDFName.of('ExtGState'), PDFDict)
    .set(PDFName.of('G4'), document.context.obj({ ca: 1, BM: 'Normal' }))
  const rewritten = await rewriteEffectsPdf(await document.save())
  const output = await PDFDocument.load(rewritten.bytes)
  expect(decode(output, output.getPage(0).node.Contents())).toMatch(/\/SegnaviaBackdrop\d+ Do \/Glass Do/)
  expect(decode(output, formNamed(output, 'Glass'))).not.toContain('/Raster Do')
  expectOrder(decode(output, hoistedFrost(output)), ['1093.75 0 0 -875 .25 875.625 cm', 'Do'])
})

test('does not hoist when clip or cm sits outside a q frame', async () => {
  const rewritten = await rewriteEffectsPdf(
    await (await capturedBlendDocument('0 0 10 10 re W n 3 0 0 3 0 0 cm /Raster Do q /Blend gs /Text Do Q')).document.save(),
  )
  const output = await PDFDocument.load(rewritten.bytes)
  expect(decode(output, output.getPage(0).node.Contents())).not.toContain('SegnaviaBackdrop')
  expect(decode(output, formNamed(output, 'Glass'))).toContain('/Raster Do')
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

const MASKED_PAGE = '1 0 0 rg /Mask gs 0 0 1 1 re f /None gs /Glass Do'

async function maskedBlendDocument(attach: (document: PDFDocument, stream: PDFRawStream) => void): Promise<PDFDocument> {
  const { document } = await capturedBlendDocument()
  const page = document.getPage(0)
  const coverage = document.context.register(
    document.context.stream(Uint8Array.of(0, 255), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: 1,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
    }),
  )
  const maskForm = document.context.register(
    document.context.stream('q 1 0 0 -1 0 1 cm /Coverage Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 1, 1],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceGray', I: true },
      Resources: { XObject: { Coverage: coverage } },
    }),
  )
  const mask = document.context.register(document.context.obj({ Type: 'Mask', S: 'Luminosity', G: maskForm }))
  page.node.Resources()?.set(PDFName.of('ExtGState'), document.context.obj({ Mask: { SMask: mask }, None: { SMask: 'None' } }))
  attach(document, document.context.stream(MASKED_PAGE))
  return document
}

function pageContentsText(document: PDFDocument): string {
  const contents = document.getPage(0).node.Contents()
  const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return objects.map((object) => decode(document, object)).join('\n')
}

function pageContentStreams(document: PDFDocument): PDFRawStream[] {
  const contents = document.getPage(0).node.Contents()
  const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return objects
    .map((object) => (object instanceof PDFRawStream ? object : document.context.lookup(object)))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
}

test('rewritten glass-shaped pages stay Page dictionaries', async () => {
  const document = await maskedBlendDocument((document, stream) => {
    document.getPage(0).node.set(PDFName.of('Contents'), document.context.register(stream))
  })
  const rewritten = await rewriteEffectsPdf(await document.save())
  const output = await PDFDocument.load(rewritten.bytes)
  const pages = output.getPages()
  expect(pages.length).toBe(1)
  for (const loaded of pages) {
    expect(loaded.node.get(PDFName.of('Type'))?.toString()).toBe('/Page')
    expect(loaded.node.get(PDFName.of('Contents'))).toBeInstanceOf(PDFRef)
  }
})

test.each([
  ['a direct Contents stream', (document: PDFDocument, stream: PDFRawStream) => document.getPage(0).node.set(PDFName.of('Contents'), stream)],
  [
    'a Contents array with a direct stream',
    (document: PDFDocument, stream: PDFRawStream) => document.getPage(0).node.set(PDFName.of('Contents'), document.context.obj([stream])),
  ],
])('rewritten glass-shaped pages keep %s', async (_label, attach) => {
  const document = await maskedBlendDocument(attach)
  rewriteEffectsDocument(document)
  const streams = pageContentStreams(document)
  expect(streams.length).toBeGreaterThan(0)
  for (const stream of streams) expect(stream.contents.length).toBeGreaterThan(0)
  expect(pageContentsText(document)).toContain('/SegnaviaEffect')
  const output = await PDFDocument.load(await document.save())
  expect(output.getPages().length).toBe(1)
  expect(output.getPage(0).node.get(PDFName.of('Type'))?.toString()).toBe('/Page')
  expect(pageContentsText(output)).toContain('/SegnaviaEffect')
})

test('charges each content stream once against a small document budget', async () => {
  const { contents, document, glass, text } = await capturedBlendDocument()
  const unique = decodeContent(glass).byteLength + decodeContent(text).byteLength + decodeContent(contents).byteLength
  const glassRef = document.context.getObjectRef(glass)
  if (!glassRef) throw new Error('Expected an indirect glass form')
  const budget = { decodedBytes: 0 }
  expect(hoistBackdropRasters(document, budget)).toBe(true)
  const rewritten = document.context.lookup(glassRef)
  if (!(rewritten instanceof PDFRawStream)) throw new Error('Expected the rewritten glass form')
  expect(budget.decodedBytes).toBe(unique + decodeContent(rewritten).byteLength + decodeContent(hoistedFrost(document)).byteLength)
  expect(decode(document, document.getPage(0).node.Contents())).toMatch(/SegnaviaBackdrop/)
})
