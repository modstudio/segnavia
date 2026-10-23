import { expect, test } from 'bun:test'
import { deflateSync, inflateSync } from 'node:zlib'
import { decodePDFRawStream, PDFDocument, PDFHexString, PDFName, PDFRawStream } from 'pdf-lib'
import { toPress } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { pageContent } from '../pdf-content.test-helper.ts'
import { rewritePressPdf } from './adapter.ts'
import { cachedPressColor } from './color-policy.ts'

const profile = buildPressProfile('mft1')

function setResources(document: PDFDocument, page: ReturnType<PDFDocument['addPage']>, resources: Record<string, unknown>, content: string): void {
  page.node.set(PDFName.of('Resources'), document.context.obj(resources as never))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
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

test('carries an embedded RGB profile through browser decoding before press conversion', async () => {
  const document = await PDFDocument.create()
  const embedded = Uint8Array.of(11, 22, 33, 44)
  const icc = document.context.register(document.context.stream(embedded, { N: 3 }))
  const image = document.context.register(
    document.context.stream(Uint8Array.of(51, 102, 153), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: 1,
      ColorSpace: ['ICCBased', icc],
      BitsPerComponent: 8,
    }),
  )
  setResources(document, document.addPage([10, 10]), { XObject: { I: image } }, '/I Do')
  const decodedRgb = Uint8Array.of(190, 80, 30)
  const converted = await rewritePressPdf(
    await document.save(),
    profile,
    3,
    async (png, mime) => {
      expect(mime).toBe('image/png')
      const marker = Buffer.from('PDF profile\0\0')
      const at = Buffer.from(png).indexOf(marker)
      expect(at).toBeGreaterThan(0)
      expect([...inflateSync(png.subarray(at + marker.length, png.length - 16))]).toEqual([...embedded])
      return { width: 1, height: 1, rgb: decodedRgb }
    },
    'convert',
  )
  const output = await PDFDocument.load(converted.bytes)
  const found = output.context.lookup(image) as PDFRawStream
  const actual = [...decodePDFRawStream(found).decode()].slice(1)
  const expected = cachedPressColor(
    readProfile(profile),
    3,
  )(Array.from(decodedRgb, (value) => value / 255) as [number, number, number]).map((value) => Math.round(value * 255))
  const raw = toPress(readProfile(profile), [0.2, 0.4, 0.6]).map((value) => Math.round(value * 255))
  expect(actual).toEqual(expected)
  expect(actual).not.toEqual(raw)
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
  expect(await pageContent(converted.bytes)).toContain('/CS /CMYK')
})

test('refuses a tall compact image before allocating its CMYK output', async () => {
  const document = await PDFDocument.create()
  const height = 40_000_001
  const palette = document.context.obj(['Indexed', 'DeviceRGB', 0, PDFHexString.of('000000')])
  const image = document.context.register(
    document.context.stream(deflateSync(new Uint8Array(height)), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: height,
      ColorSpace: palette,
      BitsPerComponent: 1,
      Filter: 'FlateDecode',
    }),
  )
  setResources(document, document.addPage([10, 10]), { XObject: { I: image } }, '/I Do')
  await expect(rewritePressPdf(await document.save(), profile, 3, undefined, 'convert')).rejects.toThrow(
    /image output byte count 200000005.*200000000 output bytes in one image/,
  )
})

function rgbTile(width: number, height: number): Uint8Array {
  const samples = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 3
      samples[pixel] = (x * 255) / Math.max(1, width - 1)
      samples[pixel + 1] = (y * 255) / Math.max(1, height - 1)
      samples[pixel + 2] = 80
    }
  }
  return samples
}

async function imageXObject(bytes: Uint8Array): Promise<PDFRawStream> {
  const document = await PDFDocument.load(bytes)
  const found = document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')
  if (!found) throw new Error('missing image')
  return found
}

test('jpeg encoding writes four-channel CMYK as DCTDecode without a predictor and keeps a soft mask lossless', async () => {
  const document = await PDFDocument.create()
  const mask = document.context.register(
    document.context.stream(new Uint8Array(64).fill(200), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 8,
      Height: 8,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
    }),
  )
  const image = document.context.register(
    document.context.stream(rgbTile(8, 8), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 8,
      Height: 8,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      SMask: mask,
    }),
  )
  setResources(document, document.addPage([10, 10]), { XObject: { I: image } }, '/I Do')
  const converted = await rewritePressPdf(await document.save(), profile, 3, undefined, 'convert', 'jpeg', 85)
  const output = await PDFDocument.load(converted.bytes)
  const found = output.context.lookup(image) as PDFRawStream
  expect(found.dict.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceCMYK')
  expect(found.dict.get(PDFName.of('Filter'))?.toString()).toBe('/DCTDecode')
  expect(found.dict.has(PDFName.of('DecodeParms'))).toBe(false)
  expect(found.dict.has(PDFName.of('Decode'))).toBe(false)
  const maskObject = output.context.lookup(mask) as PDFRawStream
  expect(maskObject.dict.get(PDFName.of('Filter'))?.toString() ?? 'none').not.toBe('/DCTDecode')
  expect(found.contents[0]).toBe(0xff)
  expect(found.contents[1]).toBe(0xd8)
})

test('jpeg encoding leaves grey conversion lossless', async () => {
  const { buildGrayProfile } = await import('../color/profile-fixture.test-helper.ts')
  const document = await PDFDocument.create()
  const image = document.context.register(
    document.context.stream(Uint8Array.of(51, 102, 153), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 1,
      Height: 1,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
    }),
  )
  setResources(document, document.addPage([10, 10]), { XObject: { I: image } }, '/I Do')
  const converted = await rewritePressPdf(await document.save(), buildGrayProfile('trc-gamma'), 3, undefined, 'convert', 'jpeg', 85)
  const found = await imageXObject(converted.bytes)
  expect(found.dict.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceGray')
  expect(found.dict.get(PDFName.of('Filter'))?.toString()).toBe('/FlateDecode')
})

test('a photographic raster PDF is smaller as JPEG than lossless and records channel error', async () => {
  const { decodeBaselineCmykJpeg } = await import('./jpeg-decode.test-helper.ts')
  const width = 192
  const height = 128
  const rgb = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 3
      const noise = ((x * 73 + y * 149) % 64) - 32
      rgb[pixel] = Math.max(0, Math.min(255, Math.round((x / width) * 220) + noise))
      rgb[pixel + 1] = Math.max(0, Math.min(255, Math.round((y / height) * 180) + noise))
      rgb[pixel + 2] = Math.max(0, Math.min(255, 70 + noise))
    }
  }
  const document = await PDFDocument.create()
  const image = document.context.register(
    document.context.stream(rgb, { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8 }),
  )
  setResources(document, document.addPage([width, height]), { XObject: { I: image } }, `q ${width} 0 0 ${height} 0 0 cm /I Do Q`)
  const input = await document.save()
  const lossless = await rewritePressPdf(input, profile, 3, undefined, 'convert')
  const jpeg85 = await rewritePressPdf(input, profile, 3, undefined, 'convert', 'jpeg', 85)
  const jpeg60 = await rewritePressPdf(input, profile, 3, undefined, 'convert', 'jpeg', 60)
  const losslessImage = await imageXObject(lossless.bytes)
  const jpegImage = await imageXObject(jpeg85.bytes)
  const losslessSamples = decodePDFRawStream(losslessImage).decode()
  const predicted = losslessImage.dict.has(PDFName.of('DecodeParms'))
  const samples = predicted ? losslessSamples.filter((_, index) => index % (width * 4 + 1) !== 0) : losslessSamples
  const decoded = decodeBaselineCmykJpeg(jpegImage.contents)
  let total = 0
  let max = 0
  for (let index = 0; index < samples.length; index++) {
    const error = Math.abs((decoded.samples[index] ?? 0) - (samples[index] ?? 0))
    total += error
    max = Math.max(max, error)
  }
  expect(jpeg85.bytes.byteLength).toBeLessThan(lossless.bytes.byteLength)
  expect(jpeg60.bytes.byteLength).toBeLessThan(jpeg85.bytes.byteLength)
  expect(total / samples.length).toBeLessThan(8)
  expect(max).toBeLessThan(50)
})

test('jpeg encoding writes an inline RGB image as DCTDecode DeviceCMYK', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  const prefix = new TextEncoder().encode('BI /W 8 /H 8 /CS /RGB /BPC 8 ID\n')
  const tile = rgbTile(8, 8)
  const suffix = new TextEncoder().encode('\nEI')
  const content = new Uint8Array(prefix.length + tile.length + suffix.length)
  content.set(prefix)
  content.set(tile, prefix.length)
  content.set(suffix, prefix.length + tile.length)
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
  const converted = await rewritePressPdf(await document.save(), profile, 3, undefined, 'convert', 'jpeg', 85)
  const text = await pageContent(converted.bytes)
  expect(text).toContain('/CS /CMYK')
  expect(text).toContain('/F /DCT')
  expect(text).not.toContain('/Predictor')
})
