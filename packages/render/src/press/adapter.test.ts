import { expect, test } from 'bun:test'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { inspectPressPdf, rewritePressPdf } from './adapter.ts'

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
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream('1 0 0 rg')))
  await expect(inspectPressPdf(await document.save())).rejects.toThrow(/RGB color operator/)
})

function setResources(document: PDFDocument, page: ReturnType<PDFDocument['addPage']>, resources: Record<string, unknown>, content: string): void {
  page.node.set(PDFName.of('Resources'), document.context.obj(resources as never))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream(content)))
}

test('a form XObject shared by two pages is represented once in the read-back report', async () => {
  const document = await PDFDocument.create()
  const form = document.context.flateStream('1 0 0 rg', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Resources: {} })
  const formRef = document.context.register(form)
  for (let index = 0; index < 2; index++) setResources(document, document.addPage([20, 20]), { XObject: { Shared: formRef } }, '/Shared Do')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.fills).toBe(1)
})

function type2(document: PDFDocument, from: number[], to: number[]) {
  return document.context.register(document.context.obj({ FunctionType: 2, Domain: [0, 1], C0: from, C1: to, N: 1 }))
}

test('converts axial and radial shadings through type 2 and stitching functions', async () => {
  const document = await PDFDocument.create()
  const axialFunction = type2(document, [1, 0, 0], [0, 0, 1])
  const first = type2(document, [0, 1, 0], [1, 0, 1])
  const second = type2(document, [1, 0, 1], [0, 1, 1])
  const stitching = document.context.register(
    document.context.obj({ FunctionType: 3, Domain: [0, 1], Functions: [first, second], Bounds: [0.5], Encode: [0, 1, 0, 1] }),
  )
  const axial = document.context.register(
    document.context.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [0, 0, 10, 0], Function: axialFunction, Extend: [true, true] }),
  )
  const radial = document.context.register(
    document.context.obj({ ShadingType: 3, ColorSpace: 'DeviceRGB', Coords: [5, 5, 0, 5, 5, 10], Function: stitching, Extend: [true, true] }),
  )
  const page = document.addPage([20, 20])
  setResources(document, page, { Shading: { Axial: axial, Radial: radial } }, '/Axial sh /Radial sh')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.gradientStops).toBe(6)
})

test('sets ordinary transparency groups to CMYK and preserves a gray luminosity mask group', async () => {
  const document = await PDFDocument.create()
  const form = (space?: string) =>
    document.context.register(
      document.context.flateStream('1 0 0 rg', {
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
    document.context.flateStream('', {
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
    'ASCIIHexDecode',
    (document) => {
      const page = document.addPage([10, 10])
      page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('00>', { Filter: 'ASCIIHexDecode' })))
    },
  ],
  [
    'CalRGB',
    (document) => {
      const form = document.context.register(
        document.context.flateStream('', {
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
