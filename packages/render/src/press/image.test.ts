import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { decodePDFRawStream, PDFArray, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib'
import { toGray } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildGrayProfile } from '../color/profile-fixture.test-helper.ts'
import { rewritePressPdf } from './adapter.ts'
import { buildGrayImageLookup, convertSuppliedImage, createImageState, MAX_TOTAL_IMAGE_PIXELS } from './image.ts'

const profileBytes = buildGrayProfile('trc-gamma')
const profile = readProfile(profileBytes)
const key = (name: string) => PDFName.of(name)

interface ImageOptions {
  bits?: number
  colorSpace?: unknown
  decode?: readonly number[]
  decodeParms?: Record<string, unknown>
  filter?: string | readonly string[]
  height?: number
  imageMask?: boolean
  smask?: unknown
  width?: number
}

function addImage(document: PDFDocument, bytes: Uint8Array, options: ImageOptions = {}) {
  const dictionary: Record<string, unknown> = {
    Type: 'XObject',
    Subtype: 'Image',
    Width: options.width ?? 1,
    Height: options.height ?? 1,
    ColorSpace: options.colorSpace ?? 'DeviceRGB',
    BitsPerComponent: options.bits ?? 8,
  }
  if (options.filter) dictionary.Filter = options.filter
  if (options.decodeParms) dictionary.DecodeParms = options.decodeParms
  if (options.decode) dictionary.Decode = options.decode
  if (options.imageMask) dictionary.ImageMask = true
  if (options.smask) dictionary.SMask = options.smask
  return document.context.register(document.context.stream(bytes, dictionary as never))
}

function paint(
  document: PDFDocument,
  images: Record<string, unknown>,
  content = Object.keys(images)
    .map((name) => `/${name} Do`)
    .join(' '),
) {
  const page = document.addPage([20, 20])
  page.node.set(key('Resources'), document.context.obj({ XObject: images } as never))
  page.node.set(key('Contents'), document.context.register(document.context.stream(content)))
}

async function outputImages(bytes: Uint8Array): Promise<PDFRawStream[]> {
  const document = await PDFDocument.load(bytes)
  return document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(key('Subtype'))?.toString() === '/Image')
}

const exactByte = (red: number, green: number, blue: number) => Math.round(toGray(profile, [red / 255, green / 255, blue / 255])[0] * 255)

test('converts Flate RGB images with and without a PNG predictor', async () => {
  const document = await PDFDocument.create()
  const plain = addImage(document, deflateSync(Uint8Array.of(51, 102, 153)), { filter: 'FlateDecode' })
  const predicted = addImage(document, deflateSync(Uint8Array.of(0, 51, 102, 153)), {
    filter: 'FlateDecode',
    decodeParms: { Predictor: 15, Colors: 3, Columns: 1, BitsPerComponent: 8 },
  })
  paint(document, { Plain: plain, Predicted: predicted })
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  expect(converted.report.convertedImages).toBe(2)
  const images = await outputImages(converted.bytes)
  expect(images.map((image) => [...decodePDFRawStream(image).decode()])).toEqual([[exactByte(51, 102, 153)], [exactByte(51, 102, 153)]])
  expect(images.every((image) => image.dict.get(key('ColorSpace'))?.toString() === '/DeviceGray')).toBe(true)
})

test('bounds Flate inflation to the exact image sample size', async () => {
  const document = await PDFDocument.create()
  const image = addImage(document, deflateSync(new Uint8Array(1_000_000)), { filter: 'FlateDecode' })
  paint(document, { I: image })
  await expect(rewritePressPdf(await document.save(), profileBytes)).rejects.toThrow(/image data length greater than 3.*3 bytes/)
})

test('keeps four-bit indices and converts an Indexed RGB palette', async () => {
  const document = await PDFDocument.create()
  const palette = PDFHexString.of('ff000000ff00')
  const image = addImage(document, Uint8Array.of(0x01), { bits: 4, colorSpace: ['Indexed', 'DeviceRGB', 1, palette], width: 2 })
  paint(document, { I: image })
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const [found] = await outputImages(converted.bytes)
  expect(found?.dict.get(key('BitsPerComponent'))?.toString()).toBe('4')
  expect(decodePDFRawStream(found as PDFRawStream).decode()).toEqual(Uint8Array.of(0x01))
  const space = found?.dict.lookup(key('ColorSpace'), PDFArray)
  expect(space?.get(1).toString()).toBe('/DeviceGray')
  expect((space?.get(3) as PDFHexString | undefined)?.asBytes()).toEqual(Uint8Array.of(exactByte(255, 0, 0), exactByte(0, 255, 0)))
})

test('converts DeviceGray through the profile and preserves an SMask', async () => {
  const document = await PDFDocument.create()
  const mask = addImage(document, Uint8Array.of(77), { colorSpace: 'DeviceGray' })
  const gray = addImage(document, Uint8Array.of(102), { colorSpace: 'DeviceGray', smask: mask })
  paint(document, { Gray: gray })
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const images = await outputImages(converted.bytes)
  const found = images.find((image) => image.dict.has(key('SMask')))
  expect(found?.dict.get(key('SMask'))?.toString()).toBe(mask.toString())
  expect(decodePDFRawStream(found as PDFRawStream).decode()).toEqual(Uint8Array.of(exactByte(102, 102, 102)))
  const output = await PDFDocument.load(converted.bytes)
  expect((output.context.lookup(mask) as PDFRawStream).contents).toEqual(Uint8Array.of(77))
})

test('an image in an alpha-mask form uses PDF luminosity and keeps opacity data', async () => {
  const document = await PDFDocument.create()
  const image = addImage(document, Uint8Array.of(51, 102, 153))
  const form = document.context.register(
    document.context.stream('/I Do', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 1, 1],
      Resources: { XObject: { I: image } },
      Group: { S: 'Transparency', CS: 'DeviceRGB' },
    }),
  )
  const transfer = document.context.register(document.context.stream(Uint8Array.of(9, 8, 7), { FunctionType: 4 }))
  const smask = document.context.register(document.context.obj({ S: 'Alpha', G: form, TR: transfer }))
  const page = document.addPage([10, 10])
  page.node.set(key('Resources'), document.context.obj({ ExtGState: { Mask: { SMask: smask } } }))
  page.node.set(key('Contents'), document.context.register(document.context.stream('/Mask gs')))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const [found] = await outputImages(converted.bytes)
  expect(decodePDFRawStream(found as PDFRawStream).decode()).toEqual(Uint8Array.of(Math.round(0.3 * 51 + 0.59 * 102 + 0.11 * 153)))
  expect(decodePDFRawStream(found as PDFRawStream).decode()[0]).not.toBe(exactByte(51, 102, 153))
  const output = await PDFDocument.load(converted.bytes)
  expect((output.context.lookup(transfer) as PDFRawStream).contents).toEqual(Uint8Array.of(9, 8, 7))
})

test('converts an image object referenced twice only once', async () => {
  const document = await PDFDocument.create()
  const image = addImage(document, Uint8Array.of(51, 102, 153))
  paint(document, { First: image, Second: image })
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  expect(converted.report.convertedImages).toBe(1)
})

test('uses an injected decoder for DCT images and validates its dimensions', async () => {
  const document = await PDFDocument.create()
  const image = addImage(document, Uint8Array.of(1, 2, 3), { filter: 'DCTDecode' })
  paint(document, { I: image })
  const converted = await rewritePressPdf(await document.save(), profileBytes, 3, async () => ({ width: 1, height: 1, rgb: Uint8Array.of(51, 102, 153) }))
  const [found] = await outputImages(converted.bytes)
  expect(decodePDFRawStream(found as PDFRawStream).decode()).toEqual(Uint8Array.of(exactByte(51, 102, 153)))
  await expect(
    rewritePressPdf(await document.save(), profileBytes, 3, async () => ({ width: 2, height: 1, rgb: Uint8Array.of(0, 0, 0, 0, 0, 0) })),
  ).rejects.toThrow(/decoded JPEG dimensions 2x1/)
})

test.each([
  ['filter', { filter: 'LZWDecode' }, /image filter LZWDecode/],
  ['filter chain', { filter: ['FlateDecode', 'DCTDecode'] }, /image filter chain/],
  ['bits', { bits: 4 }, /BitsPerComponent 4/],
  ['Decode', { decode: [1, 0] }, /image Decode array/],
  ['color space', { colorSpace: 'DeviceCMYK' }, /image color space DeviceCMYK/],
  ['DCT decoder', { filter: 'DCTDecode' }, /JPEG needs the renderer's decoder/],
] as const)('refuses an unsupported image %s', async (_name, options, message) => {
  const document = await PDFDocument.create()
  const image = addImage(document, Uint8Array.of(0), options)
  paint(document, { I: image })
  await expect(rewritePressPdf(await document.save(), profileBytes)).rejects.toThrow(message)
})

test('refuses per-image and total pixel limits before decoding samples', async () => {
  const document = await PDFDocument.create()
  const tooLarge = addImage(document, Uint8Array.of(), { width: 50_000_001 })
  paint(document, { I: tooLarge })
  await expect(rewritePressPdf(await document.save(), profileBytes)).rejects.toThrow(/image pixel count 50000001.*50000000/)

  const direct = await PDFDocument.create()
  const stream = direct.context.stream(Uint8Array.of(0, 0, 0), {
    Type: 'XObject',
    Subtype: 'Image',
    Width: 1,
    Height: 1,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 8,
  })
  const state = createImageState(direct, profile)
  state.pixels = MAX_TOTAL_IMAGE_PIXELS
  await expect(convertSuppliedImage(state, stream, 'none')).rejects.toThrow(/total image pixel count 400000001.*400000000/)
})

test('the RGB lookup stays within the image conversion error thresholds', () => {
  const lookup = buildGrayImageLookup(profile)
  const differences: number[] = []
  for (let red = 0; red < 256; red += 7)
    for (let green = 0; green < 256; green += 7)
      for (let blue = 0; blue < 256; blue += 7) differences.push(Math.abs(lookup(red, green, blue) - exactByte(red, green, blue)))
  differences.sort((first, second) => first - second)
  expect(differences[Math.floor(differences.length * 0.99)]).toBeLessThanOrEqual(1)
  expect(differences.at(-1)).toBeLessThanOrEqual(2)
})

test('gray read-back refuses a planted RGB image', async () => {
  const document = await PDFDocument.create()
  const image = addImage(document, Uint8Array.of(0, 0, 0))
  paint(document, { I: image })
  const profileStream = document.context.register(document.context.stream(profileBytes, { N: 1 }))
  document.catalog.set(key('OutputIntents'), document.context.obj([{ DestOutputProfile: profileStream }]))
  const { inspectPressPdf } = await import('./report.ts')
  await expect(inspectPressPdf(await document.save())).rejects.toThrow(/image color space DeviceRGB/)
})
