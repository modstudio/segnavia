import { createRequire } from 'node:module'
import { deflateSync } from 'node:zlib'
import type { PressReport, Renderer } from '@segnavia/render'
import { readProfile } from '../../packages/render/src/color/profile.ts'
import { pngPredictor } from '../../packages/render/src/press/image-samples.ts'
import { encodeCmykJpeg } from '../../packages/render/src/press/jpeg-encode.ts'
import { processRgbResidues } from './gray-residue.ts'
import type { Raster } from './pdf-raster.ts'

type Check = (what: string, ok: boolean, detail?: string) => void
type Stats = { max: number; mean: number }

const renderRequire = createRequire(new URL('../../packages/render/package.json', import.meta.url))
const { PDFDocument, PDFName, PDFRawStream } = renderRequire('pdf-lib')

// Poppler's fixed DeviceCMYK inks measured mean/max 6.28/29 with FOGRA39L and 9.83/53 with Generic CMYK; bounds 12/64 leave a 20% runtime margin.
const proofBounds = { max: 64, mean: 12 }
// JPEG quality 85 vs lossless Flate: Poppler mean/max 0.17/1 on a 48x32 gradient; inverted samples 103/221.
const jpegTileBounds = { max: 40, mean: 8 }

const imageTile = { x0: 35, x1: 190, y0: 260, y1: 315 }

function rasterStats(first: Raster, second: Raster, region = imageTile): Stats {
  let difference = 0
  let max = 0
  let count = 0
  const x0 = Math.max(0, Math.floor(region.x0))
  const y0 = Math.max(0, Math.floor(region.y0))
  const x1 = Math.min(first.width, second.width, Math.ceil(region.x1))
  const y1 = Math.min(first.height, second.height, Math.ceil(region.y1))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const offset = (y * first.width + x) * 3
      const other = (y * second.width + x) * 3
      for (let channel = 0; channel < 3; channel++) {
        const delta = Math.abs((first.pixels[offset + channel] ?? 0) - (second.pixels[other + channel] ?? 0))
        difference += delta
        max = Math.max(max, delta)
        count++
      }
    }
  }
  return { mean: count === 0 ? Number.POSITIVE_INFINITY : difference / count, max }
}

async function imageEncodings(bytes: Uint8Array): Promise<string[]> {
  const document = await PDFDocument.load(bytes, { updateMetadata: false })
  const found: string[] = []
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue
    const space = object.dict.get(PDFName.of('ColorSpace'))?.toString() ?? 'missing'
    const filter = object.dict.get(PDFName.of('Filter'))?.toString() ?? 'none'
    found.push(`${space}:${filter}`)
  }
  return found
}

function cmykGradient(width: number, height: number): Uint8Array {
  const samples = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4
      samples[pixel] = Math.round((x / Math.max(1, width - 1)) * 255)
      samples[pixel + 1] = Math.round((y / Math.max(1, height - 1)) * 255)
      samples[pixel + 2] = 64
      samples[pixel + 3] = 32
    }
  }
  return samples
}

async function cmykImagePdf(width: number, height: number, encoded: Uint8Array, filter: string, decodeParms?: Record<string, number>): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const dictionary: Record<string, unknown> = {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceCMYK',
    BitsPerComponent: 8,
    Filter: filter,
  }
  if (decodeParms) dictionary.DecodeParms = decodeParms
  const image = document.context.register(document.context.stream(encoded, dictionary as never))
  const page = document.addPage([width, height])
  page.node.set(PDFName.of('Resources'), document.context.obj({ XObject: { I: image } } as never))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(`q ${width} 0 0 ${height} 0 0 cm /I Do Q`)))
  return document.save({ useObjectStreams: false })
}

export async function verifyConvertedPressImages(
  renderer: Renderer,
  page: Parameters<Renderer['pagePdf']>[0],
  profile: Uint8Array,
  original: Raster,
  renderRaster: (name: string, bytes: Uint8Array) => Raster,
  proofStats: (original: Raster, converted: Raster, press: ReturnType<typeof readProfile>) => Stats,
  check: Check,
): Promise<void> {
  let report: PressReport | undefined
  const converted = await renderer.pagePdf(page, {
    waitForPageReady: true,
    press: { profile, images: 'convert', report: (value) => (report = value) },
  })
  const residues = await processRgbResidues(converted)
  const losslessRaster = renderRaster('press-images-converted', converted)
  const stats = proofStats(original, losslessRaster, readProfile(profile))
  check(
    'press image conversion leaves no RGB and matches the engine proof on the image tile',
    report?.images.length === 0 &&
      report.convertedImages >= 2 &&
      residues.found.length === 0 &&
      residues.errors.length === 0 &&
      stats.mean <= proofBounds.mean &&
      stats.max <= proofBounds.max,
    `report=${JSON.stringify(report)} residues=${residues.found.join(',') || 'none'} proof mean=${stats.mean.toFixed(2)} max=${stats.max}`,
  )

  let jpegReport: PressReport | undefined
  const jpeg = await renderer.pagePdf(page, {
    waitForPageReady: true,
    press: { profile, images: 'convert', imageEncoding: 'jpeg', imageQuality: 85, report: (value) => (jpegReport = value) },
  })
  const jpegResidues = await processRgbResidues(jpeg)
  const encodings = await imageEncodings(jpeg)
  const jpegRaster = renderRaster('press-images-jpeg', jpeg)
  const tile = rasterStats(losslessRaster, jpegRaster)
  const cmykJpeg = encodings.filter((entry) => entry.startsWith('/DeviceCMYK:'))
  check(
    'jpeg press images are DCTDecode DeviceCMYK with no RGB residue and match the lossless raster of the image tile',
    jpegReport?.images.length === 0 &&
      jpegResidues.found.length === 0 &&
      jpegResidues.errors.length === 0 &&
      cmykJpeg.length > 0 &&
      cmykJpeg.every((entry) => entry === '/DeviceCMYK:/DCTDecode') &&
      tile.mean <= jpegTileBounds.mean &&
      tile.max <= jpegTileBounds.max,
    `encodings=${encodings.join(',')} residues=${jpegResidues.found.join(',') || 'none'} tile mean=${tile.mean.toFixed(2)} max=${tile.max}`,
  )

  const width = 48
  const height = 32
  const samples = cmykGradient(width, height)
  const predicted = pngPredictor(samples, width, height, 4)
  const losslessPdf = await cmykImagePdf(width, height, deflateSync(predicted), 'FlateDecode', {
    Predictor: 15,
    Colors: 4,
    Columns: width,
    BitsPerComponent: 8,
  })
  const jpegPdf = await cmykImagePdf(width, height, encodeCmykJpeg(width, height, samples, 85), 'DCTDecode')
  const inverted = Uint8Array.from(samples, (value) => 255 - value)
  const invertedPdf = await cmykImagePdf(width, height, encodeCmykJpeg(width, height, inverted, 85), 'DCTDecode')
  const losslessTile = renderRaster('press-jpeg-polarity-lossless', losslessPdf)
  const jpegTile = renderRaster('press-jpeg-polarity', jpegPdf)
  const invertedTile = renderRaster('press-jpeg-polarity-inverted', invertedPdf)
  const native = rasterStats(losslessTile, jpegTile, { x0: 0, x1: width, y0: 0, y1: height })
  const wrong = rasterStats(losslessTile, invertedTile, { x0: 0, x1: width, y0: 0, y1: height })
  check(
    'CMYK JPEG polarity matches lossless DeviceCMYK and inverted samples fail that bound',
    native.mean <= jpegTileBounds.mean && native.max <= jpegTileBounds.max && (wrong.mean > jpegTileBounds.mean || wrong.max > jpegTileBounds.max),
    `native mean=${native.mean.toFixed(2)} max=${native.max}; inverted mean=${wrong.mean.toFixed(2)} max=${wrong.max}`,
  )
}
