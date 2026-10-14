import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { inspectPressPdf, rewritePressDocument, rewritePressPdf } from './adapter.ts'
import { decodeContent, MAX_CONTENT_BYTES, MAX_DOCUMENT_CONTENT_BYTES } from './pdf-objects.ts'

const profile = buildPressProfile('mft1')

async function contentText(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return streams
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
}

test('rewrites page fills and strokes and installs the press output intent', async () => {
  const input = await PDFDocument.create()
  const page = input.addPage([100, 100])
  page.drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(1, 0, 0), borderColor: rgb(0, 0, 0), borderWidth: 2 })
  const converted = await rewritePressPdf(await input.save(), profile)
  expect(converted.report.fills).toBeGreaterThan(0)
  expect(converted.report.strokes).toBeGreaterThan(0)
  expect(converted.report.images).toEqual([])
  const text = await contentText(converted.bytes)
  expect(text).toContain(' k')
  expect(text).toContain(' K')
  expect(text).not.toMatch(/\brg\b|\bRG\b/)
  const output = await PDFDocument.load(converted.bytes)
  const intents = output.catalog.lookup(PDFName.of('OutputIntents'), PDFArray)
  const intent = intents.lookup(0, PDFDict)
  expect(intent.get(PDFName.of('S'))?.toString()).toBe('/GTS_PDFX')
  expect(intent.get(PDFName.of('OutputConditionIdentifier'))?.toString()).toBe('(Custom)')
})

test('the read-back inspection refuses an RGB operator', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('1 0 0 rg')))
  await expect(inspectPressPdf(await document.save())).rejects.toThrow(/RGB color operator/)
})

test.each([
  ['/DeviceRGB cs', /cs operator/],
  ['BI /CS /RGB ID x EI', /BI operator/],
] as const)('preserves the named content refusal for %s', async (content, message) => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
  await expect(rewritePressPdf(await document.save(), profile)).rejects.toThrow(message)
})

function setResources(document: PDFDocument, page: ReturnType<PDFDocument['addPage']>, resources: Record<string, unknown>, content: string): void {
  page.node.set(PDFName.of('Resources'), document.context.obj(resources as never))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
}

test('a form XObject shared by two pages is represented once in the read-back report', async () => {
  const document = await PDFDocument.create()
  const form = document.context.stream('1 0 0 rg', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Resources: {} })
  const formRef = document.context.register(form)
  for (let index = 0; index < 2; index++) setResources(document, document.addPage([20, 20]), { XObject: { Shared: formRef } }, '/Shared Do')
  const loaded = await PDFDocument.load(await document.save())
  expect(rewritePressDocument(loaded, readProfile(profile)).fills).toBe(1)
  const converted = await rewritePressPdf(await loaded.save(), profile)
  expect(converted.report.fills).toBe(1)
})

function type2(document: PDFDocument, from: number[], to: number[]) {
  return document.context.register(document.context.obj({ FunctionType: 2, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1], C0: from, C1: to, N: 1 }))
}

test('converts axial and radial shadings through type 2 and stitching functions', async () => {
  const document = await PDFDocument.create()
  const axialFunction = type2(document, [1, 0, 0], [0, 0, 1])
  const first = type2(document, [0, 1, 0], [1, 0, 1])
  const second = type2(document, [1, 0, 1], [0, 1, 1])
  const stitching = document.context.register(
    document.context.obj({ FunctionType: 3, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1], Functions: [first, second], Bounds: [0.5], Encode: [0, 1, 0, 1] }),
  )
  const axial = document.context.register(
    document.context.obj({
      ShadingType: 2,
      ColorSpace: 'DeviceRGB',
      Background: [0.5, 0.25, 0],
      Coords: [0, 0, 10, 0],
      Function: axialFunction,
      Extend: [true, true],
    }),
  )
  const radial = document.context.register(
    document.context.obj({ ShadingType: 3, ColorSpace: 'DeviceRGB', Coords: [5, 5, 0, 5, 5, 10], Function: stitching, Extend: [true, true] }),
  )
  const page = document.addPage([20, 20])
  setResources(document, page, { Shading: { Axial: axial, Radial: radial } }, '/Axial sh /Radial sh')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.gradientStops).toBe(6)
  const output = await PDFDocument.load(converted.bytes)
  const dictionaries = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFDict => object instanceof PDFDict)
  const functions = dictionaries.filter((dictionary) => dictionary.has(PDFName.of('FunctionType')))
  const shadings = dictionaries.filter((dictionary) => dictionary.has(PDFName.of('ShadingType')))
  expect(functions.every((fn) => fn.lookup(PDFName.of('Range'), PDFArray).size() === 8)).toBe(true)
  expect(
    shadings
      .find((shading) => shading.has(PDFName.of('Background')))
      ?.lookup(PDFName.of('Background'), PDFArray)
      .size(),
  ).toBe(4)
})

test('sets ordinary transparency groups to CMYK and preserves a gray luminosity mask group', async () => {
  const document = await PDFDocument.create()
  const form = (space?: string) =>
    document.context.register(
      document.context.stream('1 0 0 rg', {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 10, 10],
        Resources: {},
        Group: { S: 'Transparency', ...(space ? { CS: space } : {}) },
      }),
    )
  const inherited = form()
  const rgbGroup = form('DeviceRGB')
  const grayMask = document.context.register(
    document.context.stream('', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: {},
      Group: { S: 'Transparency', CS: 'DeviceGray' },
    }),
  )
  const mask = document.context.register(document.context.obj({ S: 'Luminosity', G: grayMask }))
  const page = document.addPage([20, 20])
  setResources(document, page, { XObject: { Inherited: inherited, Rgb: rgbGroup }, ExtGState: { Mask: { SMask: mask } } }, '/Inherited Do /Rgb Do /Mask gs')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.groups).toBe(2)
})

test('converts page groups while leaving ordinary and mask DeviceGray groups alone', async () => {
  const document = await PDFDocument.create()
  for (const space of [undefined, 'DeviceRGB', 'DeviceGray']) {
    const page = document.addPage([10, 10])
    page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('0 g')))
    page.node.set(PDFName.of('Group'), document.context.obj({ S: 'Transparency', ...(space ? { CS: space } : {}) }))
  }
  const grayForm = document.context.register(
    document.context.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1], Group: { S: 'Transparency', CS: 'DeviceGray' } }),
  )
  const alphaMask = document.context.register(document.context.obj({ S: 'Alpha', G: grayForm }))
  document.getPage(2).node.set(PDFName.of('Resources'), document.context.obj({ ExtGState: { Mask: { SMask: alphaMask } } }))
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.groups).toBe(2)
})

test('classifies an unknown group color space without echoing its name', async () => {
  const document = await PDFDocument.create()
  const unknown = `secret-${'x'.repeat(8_000)}`
  const form = document.context.register(
    document.context.stream('', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 1, 1],
      Resources: {},
      Group: { S: 'Transparency', CS: PDFName.of(unknown) },
    }),
  )
  setResources(document, document.addPage([10, 10]), { XObject: { Bad: form } }, '/Bad Do')
  try {
    await rewritePressPdf(await document.save(), profile)
    throw new Error('Expected the unknown group color space to be refused')
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('transparency group color space other')
    expect((error as Error).message).not.toContain('secret-')
    expect((error as Error).message.length).toBeLessThan(256)
  }
})

test('rewrites Type 3 glyph color and reports an RGB image drawn by a glyph', async () => {
  const document = await PDFDocument.create()
  const image = document.context.register(
    document.context.stream(Uint8Array.of(255, 0, 0), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: 1,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
    }),
  )
  const glyph = document.context.register(document.context.stream('1 0 0 rg /Emoji Do', { Resources: { XObject: { Emoji: image } } }))
  const font = document.context.register(
    document.context.obj({
      Type: 'Font',
      Subtype: 'Type3',
      FontBBox: [0, 0, 10, 10],
      FontMatrix: [0.1, 0, 0, 0.1, 0, 0],
      CharProcs: { A: glyph },
      Encoding: { Type: 'Encoding', Differences: [65, 'A'] },
      FirstChar: 65,
      LastChar: 65,
      Widths: [10],
      Resources: {},
    }),
  )
  setResources(document, document.addPage([20, 20]), { Font: { F1: font } }, '/F1 10 Tf (A) Tj')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.fills).toBe(1)
  expect(converted.report.images).toEqual([{ width: 1, height: 1, colorSpace: 'DeviceRGB' }])
})

test('accepts the compression filter expressed as a one-element filter array', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  const content = document.context.stream(deflateSync(new TextEncoder().encode('1 0 0 rg')), { Filter: ['Fl' + 'ateDecode'] })
  page.node.set(PDFName.of('Contents'), document.context.register(content))
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.fills).toBe(1)
})

test('stores rewritten content with compression', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('1 0 0 rg')))
  const converted = await rewritePressPdf(await document.save(), profile)
  const output = await PDFDocument.load(converted.bytes)
  const stream = output.context.lookup(output.getPage(0).node.Contents()) as PDFRawStream
  expect(stream.dict.get(PDFName.of('Filter'))?.toString()).toBe(`/${'Fl' + 'ateDecode'}`)
})

test('rewrites annotation appearances and read-back refuses an unconverted one', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('0 0 0 1 k')))
  const appearance = document.context.register(document.context.stream('1 0 0 rg', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Resources: {} }))
  const annotation = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10], AP: { N: appearance } }))
  page.node.set(PDFName.of('Annots'), document.context.obj([annotation]))
  const input = await document.save()
  await expect(inspectPressPdf(input)).rejects.toThrow(/RGB color operator/)
  const converted = await rewritePressPdf(input, profile)
  expect(converted.report.fills).toBe(2)
})

test.each([false, true])('collects a cross-page mask source through a %s ExtGState', async (indirect) => {
  const document = await PDFDocument.create()
  const form = document.context.register(
    document.context.stream('0 0 0 1 k', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: {},
      Group: { S: 'Transparency', CS: 'DeviceRGB' },
    }),
  )
  setResources(document, document.addPage([20, 20]), { XObject: { Shared: form } }, '/Shared Do')
  const mask = document.context.register(document.context.obj({ S: 'Luminosity', G: form }))
  const graphicsState = document.context.obj({ SMask: mask })
  const stateValue = indirect ? document.context.register(graphicsState) : graphicsState
  setResources(document, document.addPage([20, 20]), { ExtGState: { Mask: stateValue } }, '/Mask gs')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.groups).toBe(0)
  const output = await PDFDocument.load(converted.bytes)
  const convertedForm = output.context.lookup(form) as PDFRawStream
  const group = convertedForm.dict.lookup(PDFName.of('Group'), PDFDict)
  expect(group.get(PDFName.of('CS'))?.toString()).toBe('/DeviceRGB')
})

test('bounds inflation before returning decoded content', () => {
  const document = PDFDocument.create()
  return document.then((created) => {
    const stream = created.context.stream(deflateSync(new Uint8Array(MAX_CONTENT_BYTES + 1)), { Filter: 'Fl' + 'ateDecode' })
    expect(() => decodeContent(stream)).toThrow(`decoded content stream longer than ${MAX_CONTENT_BYTES} bytes`)
  })
})

test('bounds total decoded content for one document pass', () => {
  return PDFDocument.create().then((document) => {
    const stream = document.context.stream('1234')
    expect(() => decodeContent(stream, { decodedBytes: MAX_DOCUMENT_CONTENT_BYTES - 3 })).toThrow(/total decoded content length/)
  })
})

function imageBytes(document: PDFDocument): Uint8Array[] {
  return document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')
    .map((stream) => stream.contents)
}

test('leaves DeviceRGB and ICCBased N=3 image bytes intact and lists their dimensions', async () => {
  const document = await PDFDocument.create()
  const rgbImage = document.context.register(
    document.context.stream(Uint8Array.from([1, 2, 3, 4, 5, 6]), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 2,
      Height: 1,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
    }),
  )
  const icc = document.context.register(document.context.stream(Uint8Array.of(0), { N: 3 }))
  const iccImage = document.context.register(
    document.context.stream(Uint8Array.from([7, 8, 9]), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: 1,
      ColorSpace: ['ICCBased', icc],
      BitsPerComponent: 8,
    }),
  )
  const page = document.addPage([20, 20])
  setResources(document, page, { XObject: { Rgb: rgbImage, Icc: iccImage } }, '/Rgb Do /Icc Do')
  const input = await document.save()
  const before = imageBytes(await PDFDocument.load(input)).map((value) => [...value])
  const converted = await rewritePressPdf(input, profile)
  const after = imageBytes(await PDFDocument.load(converted.bytes)).map((value) => [...value])
  expect(after).toEqual(before)
  expect(converted.report.images).toEqual([
    { width: 2, height: 1, colorSpace: 'DeviceRGB' },
    { width: 1, height: 1, colorSpace: 'ICCBased' },
  ])
})

type RefusalFixture = (document: PDFDocument) => void

function shadingRefusal(type: number, functionType = 2): RefusalFixture {
  return (document) => {
    const fn = document.context.register(
      functionType === 2
        ? document.context.obj({ FunctionType: 2, C0: [1, 0, 0], C1: [0, 0, 1] })
        : document.context.stream(Uint8Array.of(0), { FunctionType: functionType }),
    )
    const shading = document.context.register(document.context.obj({ ShadingType: type, ColorSpace: 'DeviceRGB', Function: fn }))
    setResources(document, document.addPage([10, 10]), { Shading: { Bad: shading } }, '/Bad sh')
  }
}

const refusalCases: Array<[string, RefusalFixture]> = [
  ['ShadingType 4', shadingRefusal(4)],
  ['FunctionType 0', shadingRefusal(2, 0)],
  ['FunctionType 4', shadingRefusal(2, 4)],
  [
    'content stream filter other',
    (document) => {
      const page = document.addPage([10, 10])
      page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('00>', { Filter: 'ASCIIHexDecode' })))
    },
  ],
  [
    'CalRGB',
    (document) => {
      const form = document.context.register(
        document.context.stream('', {
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, 1, 1],
          Resources: {},
          Group: { S: 'Transparency', CS: 'CalRGB' },
        }),
      )
      setResources(document, document.addPage([10, 10]), { XObject: { Bad: form } }, '/Bad Do')
    },
  ],
]

test.each(refusalCases)('refuses unsupported adapter input and names %s', async (name, build) => {
  const document = await PDFDocument.create()
  build(document)
  await expect(rewritePressPdf(await document.save(), profile)).rejects.toThrow(name)
})

test('refuses a non-CMYK press profile', async () => {
  const bytes = profile.slice()
  bytes.set(new TextEncoder().encode('RGB '), 16)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < view.getUint32(128, false); index++) {
    const record = 132 + index * 12
    const name = new TextDecoder().decode(bytes.subarray(record, record + 4))
    const offset = view.getUint32(record + 4, false)
    if (name.startsWith('A2B')) bytes[offset + 8] = 3
    if (name.startsWith('B2A')) bytes[offset + 9] = 3
  }
  const document = await PDFDocument.create()
  document.addPage()
  await expect(rewritePressPdf(await document.save(), bytes)).rejects.toThrow(/press profile color space RGB/)
})
