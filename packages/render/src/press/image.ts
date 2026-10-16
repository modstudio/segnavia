import { deflateSync, inflateSync } from 'node:zlib'
import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import type { Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { destinationColor } from './color-policy.ts'
import { nameOf, numberOf, rawStreamOf } from './pdf-objects.ts'
import type { MaskContext } from './visitor.ts'

export const MAX_IMAGE_PIXELS = 50_000_000
export const MAX_TOTAL_IMAGE_PIXELS = 400_000_000

export interface JpegPixels {
  width: number
  height: number
  rgb: Uint8Array
}

export type JpegDecoder = (bytes: Uint8Array) => Promise<JpegPixels>

export interface ImageState {
  counted: WeakSet<PDFRawStream>
  converted: WeakMap<PDFRawStream, PDFRawStream>
  decodeJpeg?: JpegDecoder
  document: PDFDocument
  profile: Profile
  rgbLookup: GrayLookup
  grayLookup: Uint8Array
  pixels: number
  total: number
}

interface BaseSpace {
  channels: 1 | 3
  kind: 'gray' | 'rgb'
  label: string
}

interface IndexedSpace {
  base: BaseSpace
  high: number
  kind: 'indexed'
  label: string
  lookup: Uint8Array
}

type ImageSpace = BaseSpace | IndexedSpace
type GrayLookup = (red: number, green: number, blue: number) => number

const key = (value: string): PDFName => PDFName.of(value)
const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

function bytesOf(document: PDFDocument, object: PDFObject | undefined): Uint8Array | undefined {
  const value = resolved(document, object)
  if (value instanceof PDFString || value instanceof PDFHexString) return value.asBytes()
  const stream = rawStreamOf(value)
  if (!stream) return undefined
  const filter = nameOf(resolved(document, stream.dict.get(key('Filter'))))
  if (!filter) return stream.contents
  if (filter === 'FlateDecode' || filter === 'Fl') return inflate(stream.contents, 'Indexed lookup')
  return undefined
}

function baseSpace(document: PDFDocument, object: PDFObject | undefined): BaseSpace | undefined {
  const value = resolved(document, object)
  const name = nameOf(value)
  if (name === 'DeviceRGB') return { channels: 3, kind: 'rgb', label: name }
  if (name === 'DeviceGray') return { channels: 1, kind: 'gray', label: name }
  if (!(value instanceof PDFArray) || nameOf(resolved(document, value.get(0))) !== 'ICCBased') return undefined
  const profile = rawStreamOf(resolved(document, value.get(1)))
  const channels = profile ? numberOf(profile.dict, 'N') : undefined
  if (channels === 1) return { channels, kind: 'gray', label: 'ICCBased N 1' }
  if (channels === 3) return { channels, kind: 'rgb', label: 'ICCBased N 3' }
  return undefined
}

function imageSpace(document: PDFDocument, object: PDFObject | undefined): ImageSpace {
  const base = baseSpace(document, object)
  if (base) return base
  const value = resolved(document, object)
  if (value instanceof PDFArray && nameOf(resolved(document, value.get(0))) === 'Indexed') {
    const indexedBase = baseSpace(document, value.get(1))
    const high = resolved(document, value.get(2))
    const lookup = bytesOf(document, value.get(3))
    if (indexedBase && high instanceof PDFNumber && lookup) {
      return { base: indexedBase, high: high.asNumber(), kind: 'indexed', label: `Indexed over ${indexedBase.label}`, lookup }
    }
  }
  const label = nameOf(value) ?? (value instanceof PDFArray ? (nameOf(resolved(document, value.get(0))) ?? 'array') : 'missing')
  return refuse(`image color space ${label}`, 'DeviceRGB, DeviceGray, ICCBased with N 1 or 3, or Indexed over one of those')
}

function filterName(document: PDFDocument, image: PDFRawStream): 'flate' | 'jpeg' | 'none' {
  const value = resolved(document, image.dict.get(key('Filter')))
  if (!value) return 'none'
  if (value instanceof PDFArray) refuse('image filter chain', 'no filter, FlateDecode, or DCTDecode')
  const name = nameOf(value)
  if (name === 'FlateDecode' || name === 'Fl') return 'flate'
  if (name === 'DCTDecode' || name === 'DCT') return 'jpeg'
  return refuse(`image filter ${name ?? 'other'}`, 'no filter, FlateDecode, or DCTDecode')
}

function inflate(bytes: Uint8Array, structure: string): Uint8Array {
  try {
    return inflateSync(bytes)
  } catch {
    return refuse(`${structure} FlateDecode data`, 'valid FlateDecode data')
  }
}

const paeth = (left: number, above: number, upperLeft: number): number => {
  const estimate = left + above - upperLeft
  const leftDistance = Math.abs(estimate - left)
  const aboveDistance = Math.abs(estimate - above)
  const upperLeftDistance = Math.abs(estimate - upperLeft)
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft
}

const predictorAddition = (filter: number, left: number, above: number, upperLeft: number): number => {
  if (filter === 1) return left
  if (filter === 2) return above
  if (filter === 3) return Math.floor((left + above) / 2)
  if (filter === 4) return paeth(left, above, upperLeft)
  return 0
}

function undoPngPredictor(bytes: Uint8Array, width: number, height: number, colors: number, bits: number): Uint8Array {
  const rowBytes = Math.ceil((width * colors * bits) / 8)
  const pixelBytes = Math.max(1, Math.ceil((colors * bits) / 8))
  if (bytes.length !== (rowBytes + 1) * height) refuse(`image predictor data length ${bytes.length}`, `${height} rows of ${rowBytes + 1} bytes`)
  const output = new Uint8Array(rowBytes * height)
  let source = 0
  for (let row = 0; row < height; row++) {
    const filter = bytes[source++] ?? 0
    if (filter > 4) refuse(`image PNG predictor filter ${filter}`, 'filters 0 through 4')
    const target = row * rowBytes
    for (let column = 0; column < rowBytes; column++) {
      const raw = bytes[source++] ?? 0
      const left = output[target + column - pixelBytes] ?? 0
      const above = output[target + column - rowBytes] ?? 0
      const upperLeft = output[target + column - rowBytes - pixelBytes] ?? 0
      const add = predictorAddition(filter, left, above, upperLeft)
      output[target + column] = (raw + add) & 255
    }
  }
  return output
}

function decodeFlate(state: ImageState, image: PDFRawStream, width: number, height: number, channels: number, bits: number): Uint8Array {
  const inflated = inflate(image.contents, 'image')
  const rawParms = resolved(state.document, image.dict.get(key('DecodeParms')))
  if (!rawParms) return inflated
  if (!(rawParms instanceof PDFDict)) refuse('image DecodeParms', 'no DecodeParms or a PNG predictor 10 through 15')
  const parms = rawParms as PDFDict
  const predictor = numberOf(parms, 'Predictor') ?? 1
  if (predictor < 10 || predictor > 15) refuse(`image predictor ${predictor}`, 'a PNG predictor 10 through 15')
  const colors = numberOf(parms, 'Colors') ?? 1
  const columns = numberOf(parms, 'Columns') ?? 1
  const predictorBits = numberOf(parms, 'BitsPerComponent') ?? 8
  if (columns !== width || colors !== channels || predictorBits !== bits)
    refuse('image PNG predictor parameters', `Colors ${channels}, Columns ${width}, and BitsPerComponent ${bits}`)
  return undoPngPredictor(inflated, width, height, colors, predictorBits)
}

function isDefaultDecode(image: PDFRawStream, channels: number, bits: number, indexed: boolean): boolean {
  const decode = image.dict.lookupMaybe(key('Decode'), PDFArray)
  if (!decode) return true
  if (decode.size() !== channels * 2) return false
  const high = 2 ** bits - 1
  for (let channel = 0; channel < channels; channel++) {
    const lowValue = decode.lookupMaybe(channel * 2, PDFNumber)?.asNumber()
    const highValue = decode.lookupMaybe(channel * 2 + 1, PDFNumber)?.asNumber()
    if (lowValue !== 0 || highValue !== (indexed ? high : 1)) return false
  }
  return true
}

function grayTable(profile: Profile): Uint8Array {
  const table = new Uint8Array(256)
  for (let value = 0; value < 256; value++) table[value] = Math.round(destinationColor(profile, [value / 255, value / 255, value / 255], 0)[0] * 255)
  return table
}

export function buildGrayImageLookup(profile: Profile, size = 33): GrayLookup {
  const table = new Uint8Array(size ** 3)
  const at = (red: number, green: number, blue: number) => (red * size + green) * size + blue
  for (let red = 0; red < size; red++)
    for (let green = 0; green < size; green++)
      for (let blue = 0; blue < size; blue++) {
        const value = destinationColor(profile, [red / (size - 1), green / (size - 1), blue / (size - 1)], 0)[0]
        table[at(red, green, blue)] = Math.round(Math.max(0, Math.min(1, value)) * 255)
      }
  return (red, green, blue) => {
    const scale = (size - 1) / 255
    const r = red * scale,
      g = green * scale,
      b = blue * scale
    const r0 = Math.floor(r),
      g0 = Math.floor(g),
      b0 = Math.floor(b)
    const r1 = Math.min(size - 1, r0 + 1),
      g1 = Math.min(size - 1, g0 + 1),
      b1 = Math.min(size - 1, b0 + 1)
    const rf = r - r0,
      gf = g - g0,
      bf = b - b0
    const mix = (first: number, second: number, amount: number) => first + (second - first) * amount
    const low = mix(mix(table[at(r0, g0, b0)] ?? 0, table[at(r1, g0, b0)] ?? 0, rf), mix(table[at(r0, g1, b0)] ?? 0, table[at(r1, g1, b0)] ?? 0, rf), gf)
    const high = mix(mix(table[at(r0, g0, b1)] ?? 0, table[at(r1, g0, b1)] ?? 0, rf), mix(table[at(r0, g1, b1)] ?? 0, table[at(r1, g1, b1)] ?? 0, rf), gf)
    return Math.round(mix(low, high, bf))
  }
}

function streamDictionary(stream: PDFRawStream): Record<string, PDFObject> {
  const dictionary: Record<string, PDFObject> = { Filter: key('FlateDecode') }
  for (const [name, value] of stream.dict.entries()) {
    const label = name.toString().slice(1)
    if (!['Filter', 'DecodeParms', 'Length', 'ColorSpace', 'BitsPerComponent', 'Decode'].includes(label)) dictionary[label] = value
  }
  return dictionary
}

function profileRgb(state: ImageState, source: Uint8Array, space: BaseSpace, mask: MaskContext, pixels: number): Uint8Array {
  const expected = pixels * space.channels
  if (source.length !== expected) refuse(`image sample length ${source.length}`, `${expected} bytes for its dimensions and color space`)
  const output = new Uint8Array(pixels)
  for (let pixel = 0; pixel < pixels; pixel++) {
    const first = source[pixel * space.channels] ?? 0
    const red = first,
      green = space.channels === 1 ? first : (source[pixel * 3 + 1] ?? 0),
      blue = space.channels === 1 ? first : (source[pixel * 3 + 2] ?? 0)
    output[pixel] =
      mask === 'none'
        ? space.kind === 'gray'
          ? (state.grayLookup[first] ?? 0)
          : state.rgbLookup(red, green, blue)
        : Math.round(0.3 * red + 0.59 * green + 0.11 * blue)
  }
  return output
}

function paletteToGray(state: ImageState, space: IndexedSpace, mask: MaskContext): Uint8Array {
  const count = space.high + 1
  const expected = count * space.base.channels
  if (!Number.isInteger(space.high) || space.high < 0 || space.high > 255 || space.lookup.length < expected)
    refuse(`Indexed image lookup length ${space.lookup.length}`, `${expected} bytes for entries 0 through ${space.high}`)
  return profileRgb(state, space.lookup.subarray(0, expected), space.base, mask, count)
}

async function sourceBytes(
  state: ImageState,
  image: PDFRawStream,
  filter: ReturnType<typeof filterName>,
  width: number,
  height: number,
  channels: number,
  bits: number,
) {
  if (filter === 'none') return image.contents
  if (filter === 'flate') return decodeFlate(state, image, width, height, channels, bits)
  if (!state.decodeJpeg) refuse('DCTDecode image without a JPEG decoder', "a JPEG needs the renderer's decoder")
  const decoder = state.decodeJpeg as JpegDecoder
  const decoded = await decoder(image.contents)
  if (decoded.width !== width || decoded.height !== height)
    refuse(`decoded JPEG dimensions ${decoded.width}x${decoded.height}`, `the image Width and Height ${width}x${height}`)
  if (decoded.rgb.length !== width * height * 3) refuse(`decoded JPEG sample length ${decoded.rgb.length}`, `${width * height * 3} RGB bytes`)
  return decoded.rgb
}

export function createImageState(document: PDFDocument, profile: Profile, decodeJpeg?: JpegDecoder): ImageState {
  return {
    counted: new WeakSet(),
    converted: new WeakMap(),
    decodeJpeg,
    document,
    profile,
    rgbLookup: buildGrayImageLookup(profile),
    grayLookup: grayTable(profile),
    pixels: 0,
    total: 0,
  }
}

function countSuppliedImage(state: ImageState, image: PDFRawStream, mask: MaskContext): void {
  if (mask !== 'none' || state.counted.has(image)) return
  state.counted.add(image)
  state.total++
}

function imageGeometry(image: PDFRawStream): { height: number; pixels: number; width: number } {
  const width = numberOf(image.dict, 'Width') ?? refuse('image Width missing', 'a positive Width number')
  const height = numberOf(image.dict, 'Height') ?? refuse('image Height missing', 'a positive Height number')
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    refuse(`image dimensions ${width}x${height}`, 'positive integer Width and Height')
  const pixels = width * height
  if (pixels > MAX_IMAGE_PIXELS) refuse(`image pixel count ${pixels}`, `at most ${MAX_IMAGE_PIXELS} pixels in one image`)
  return { height, pixels, width }
}

function chargePixels(state: ImageState, pixels: number): void {
  state.pixels += pixels
  if (state.pixels > MAX_TOTAL_IMAGE_PIXELS) refuse(`total image pixel count ${state.pixels}`, `at most ${MAX_TOTAL_IMAGE_PIXELS} pixels in one render`)
}

export async function convertSuppliedImage(state: ImageState, image: PDFRawStream, mask: MaskContext): Promise<PDFRawStream | undefined> {
  const existing = state.converted.get(image)
  if (existing) {
    countSuppliedImage(state, image, mask)
    return existing
  }
  if (image.dict.has(key('SegnaviaGeneratedEffect')) || image.dict.get(key('ImageMask'))?.toString() === 'true') return undefined
  const { width, height, pixels } = imageGeometry(image)
  chargePixels(state, pixels)
  const space = imageSpace(state.document, image.dict.get(key('ColorSpace')))
  const bits = numberOf(image.dict, 'BitsPerComponent')
  const allowedBits = space.kind === 'indexed' ? [1, 2, 4, 8] : [8]
  if (bits === undefined || !allowedBits.includes(bits)) refuse(`image BitsPerComponent ${bits ?? 'missing'}`, allowedBits.join(', '))
  const componentBits = bits as number
  const channels = space.kind === 'indexed' ? 1 : space.channels
  if (!isDefaultDecode(image, channels, componentBits, space.kind === 'indexed')) refuse('image Decode array', 'the default Decode array')
  const filter = filterName(state.document, image)
  if (space.kind === 'indexed' && filter === 'jpeg') refuse('Indexed image filter DCTDecode', 'no filter or FlateDecode')
  const source = await sourceBytes(state, image, filter, width, height, filter === 'jpeg' ? 3 : channels, componentBits)
  const dictionary = streamDictionary(image)
  let output: Uint8Array
  if (space.kind === 'indexed') {
    const expected = Math.ceil((width * componentBits) / 8) * height
    if (source.length !== expected) refuse(`Indexed image sample length ${source.length}`, `${expected} bytes for its dimensions`)
    output = source
    const palette = paletteToGray(state, space, mask)
    dictionary.ColorSpace = state.document.context.obj(['Indexed', 'DeviceGray', space.high, PDFHexString.of(Buffer.from(palette).toString('hex'))])
    dictionary.BitsPerComponent = state.document.context.obj(componentBits)
  } else {
    output = profileRgb(state, source, filter === 'jpeg' ? { channels: 3, kind: 'rgb', label: 'decoded JPEG' } : space, mask, pixels)
    dictionary.ColorSpace = key('DeviceGray')
    dictionary.BitsPerComponent = state.document.context.obj(8)
  }
  const replacement = state.document.context.stream(deflateSync(output), dictionary)
  state.converted.set(image, replacement)
  countSuppliedImage(state, image, mask)
  return replacement
}

export const convertedImageCount = (state: ImageState): number => state.total
