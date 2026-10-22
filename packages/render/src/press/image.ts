import { deflateSync, inflateSync } from 'node:zlib'
import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, type PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import type { Profile } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { cachedPressColor, pressDestination } from './color-policy.ts'
import {
  type BaseSpace,
  buildGrayImageLookup,
  type GrayLookup,
  grayTable,
  type IndexedSpace,
  indexedToProfile,
  paletteToGray,
  profileRgb,
} from './image-color.ts'
import { chargeImageLimits } from './image-limits.ts'
import { pngPredictor } from './image-samples.ts'
import { nameOf, numberOf, rawStreamOf } from './pdf-objects.ts'
import { imageAction } from './policy.ts'
import type { MaskContext } from './visitor.ts'

export { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, MAX_TOTAL_IMAGE_BYTES, MAX_TOTAL_IMAGE_PIXELS } from './image-limits.ts'

export interface JpegPixels {
  width: number
  height: number
  rgb: Uint8Array
}

export type JpegDecoder = (bytes: Uint8Array) => Promise<JpegPixels>

export interface ImageState {
  counted: WeakSet<PDFRawStream>
  converted: WeakMap<PDFRawStream, Partial<Record<ImageConversionContext, PDFRawStream>>>
  decodeJpeg?: JpegDecoder
  document: PDFDocument
  convert: ReturnType<typeof cachedPressColor>
  destination: 'cmyk' | 'gray'
  profile: Profile
  rgbLookup: GrayLookup
  grayLookup: Uint8Array
  pixels: number
  bytes: number
  total: number
}

type ImageSpace = BaseSpace | IndexedSpace
type ImageConversionContext = 'profile' | 'luminosity'

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
  if (name === 'DeviceCMYK') return { channels: 4, kind: 'cmyk', label: name }
  if (!(value instanceof PDFArray) || nameOf(resolved(document, value.get(0))) !== 'ICCBased') return undefined
  const profile = rawStreamOf(resolved(document, value.get(1)))
  const channels = profile ? numberOf(profile.dict, 'N') : undefined
  if (channels === 1) return { channels, kind: 'gray', label: 'ICCBased N 1' }
  if (channels === 3) return { channels, kind: 'rgb', label: 'ICCBased N 3' }
  if (channels === 4) return { channels, kind: 'cmyk', label: 'ICCBased N 4' }
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
  return refuse(`image color space ${label}`, 'DeviceRGB, DeviceGray, DeviceCMYK, ICCBased with N 1, 3, or 4, or Indexed over one of those')
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

function inflate(bytes: Uint8Array, structure: string, maximum?: number): Uint8Array {
  try {
    return inflateSync(bytes, maximum === undefined ? undefined : { maxOutputLength: maximum })
  } catch (error) {
    if (maximum !== undefined && error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE')
      return refuse(`${structure} data length greater than ${maximum}`, `${maximum} bytes`)
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
  const rawParms = resolved(state.document, image.dict.get(key('DecodeParms')))
  const rowBytes = Math.ceil((width * channels * bits) / 8)
  if (!rawParms) return inflate(image.contents, 'image', rowBytes * height)
  if (!(rawParms instanceof PDFDict)) refuse('image DecodeParms', 'no DecodeParms or a PNG predictor 10 through 15')
  const parms = rawParms as PDFDict
  const predictor = numberOf(parms, 'Predictor') ?? 1
  if (predictor < 10 || predictor > 15) refuse(`image predictor ${predictor}`, 'a PNG predictor 10 through 15')
  const colors = numberOf(parms, 'Colors') ?? 1
  const columns = numberOf(parms, 'Columns') ?? 1
  const predictorBits = numberOf(parms, 'BitsPerComponent') ?? 8
  if (columns !== width || colors !== channels || predictorBits !== bits)
    refuse('image PNG predictor parameters', `Colors ${channels}, Columns ${width}, and BitsPerComponent ${bits}`)
  const expected = (rowBytes + 1) * height
  const inflated = inflate(image.contents, 'image predictor', expected)
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

export { buildGrayImageLookup } from './image-color.ts'

function streamDictionary(stream: PDFRawStream): Record<string, PDFObject> {
  const dictionary: Record<string, PDFObject> = { Filter: key('FlateDecode') }
  for (const [name, value] of stream.dict.entries()) {
    const label = name.toString().slice(1)
    if (!['Filter', 'DecodeParms', 'Length', 'ColorSpace', 'BitsPerComponent', 'Decode'].includes(label)) dictionary[label] = value
  }
  return dictionary
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
  const decoded = await decodeJpeg(decoder, image.contents)
  if (decoded.width !== width || decoded.height !== height)
    refuse(`decoded JPEG dimensions ${decoded.width}x${decoded.height}`, `the image Width and Height ${width}x${height}`)
  if (decoded.rgb.length !== width * height * 3) refuse(`decoded JPEG sample length ${decoded.rgb.length}`, `${width * height * 3} RGB bytes`)
  return decoded.rgb
}

async function decodeJpeg(decoder: JpegDecoder, bytes: Uint8Array): Promise<JpegPixels> {
  try {
    return await decoder(bytes)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return refuse(`JPEG decoding failure: ${message}`, "a JPEG the renderer's browser can decode")
  }
}

export function createImageState(document: PDFDocument, profile: Profile, decodeJpeg?: JpegDecoder, tolerance?: number): ImageState {
  return {
    bytes: 0,
    counted: new WeakSet(),
    convert: cachedPressColor(profile, tolerance),
    converted: new WeakMap(),
    decodeJpeg,
    destination: pressDestination(profile),
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

interface PreparedImage {
  bits: number
  filter: ReturnType<typeof filterName>
  height: number
  pixels: number
  source: Uint8Array
  space: ImageSpace
  width: number
}

async function prepareImage(state: ImageState, image: PDFRawStream): Promise<PreparedImage | undefined> {
  const space = imageSpace(state.document, image.dict.get(key('ColorSpace')))
  const base = space.kind === 'indexed' ? space.base : space
  const action = imageAction(base.kind, state.destination)
  if (action.action === 'keep') return undefined
  if (action.action === 'refuse') return refuse(`image color space ${base.label}`, action.supported)
  const { width, height, pixels } = chargeImageLimits(state, image)
  const bits = numberOf(image.dict, 'BitsPerComponent')
  const allowedBits = space.kind === 'indexed' ? [1, 2, 4, 8] : [8]
  if (bits === undefined || !allowedBits.includes(bits)) refuse(`image BitsPerComponent ${bits ?? 'missing'}`, allowedBits.join(', '))
  const componentBits = bits as number
  const channels = space.kind === 'indexed' ? 1 : space.channels
  if (!isDefaultDecode(image, channels, componentBits, space.kind === 'indexed')) refuse('image Decode array', 'the default Decode array')
  const filter = filterName(state.document, image)
  if (space.kind === 'indexed' && filter === 'jpeg') refuse('Indexed image filter DCTDecode', 'no filter or FlateDecode')
  const source = await sourceBytes(state, image, filter, width, height, filter === 'jpeg' ? 3 : channels, componentBits)
  return { bits: componentBits, filter, height, pixels, source, space, width }
}

function convertedImageSamples(state: ImageState, prepared: PreparedImage, mask: MaskContext, dictionary: Record<string, PDFObject>): Uint8Array {
  const { bits, filter, height, pixels, source, space, width } = prepared
  if (space.kind === 'indexed') {
    const expected = Math.ceil((width * bits) / 8) * height
    if (source.length !== expected) refuse(`Indexed image sample length ${source.length}`, `${expected} bytes for its dimensions`)
    if (state.destination === 'gray') {
      dictionary.ColorSpace = state.document.context.obj([
        'Indexed',
        'DeviceGray',
        space.high,
        PDFHexString.of(Buffer.from(paletteToGray(state, space, mask)).toString('hex')),
      ])
      dictionary.BitsPerComponent = state.document.context.obj(bits)
      return source
    }
    dictionary.ColorSpace = key(mask === 'none' ? 'DeviceCMYK' : 'DeviceGray')
    dictionary.BitsPerComponent = state.document.context.obj(8)
    return indexedToProfile(state, source, space, mask, width, height, bits)
  }
  dictionary.ColorSpace = key(mask === 'none' ? (state.destination === 'gray' ? 'DeviceGray' : 'DeviceCMYK') : 'DeviceGray')
  dictionary.BitsPerComponent = state.document.context.obj(8)
  return profileRgb(state, source, filter === 'jpeg' ? { channels: 3, kind: 'rgb', label: 'decoded JPEG' } : space, mask, pixels)
}

export async function convertSuppliedImage(state: ImageState, image: PDFRawStream, mask: MaskContext): Promise<PDFRawStream | undefined> {
  const context: ImageConversionContext = mask === 'none' ? 'profile' : 'luminosity'
  const variants = state.converted.get(image)
  const existing = variants?.[context]
  if (existing) {
    countSuppliedImage(state, image, mask)
    return existing
  }
  if (image.dict.has(key('SegnaviaGeneratedEffect')) || image.dict.get(key('ImageMask'))?.toString() === 'true') return undefined
  const prepared = await prepareImage(state, image)
  if (!prepared) return undefined
  const { width, height } = prepared
  const dictionary = streamDictionary(image)
  const output = convertedImageSamples(state, prepared, mask, dictionary)
  const outputChannels = mask === 'none' && state.destination === 'cmyk' ? 4 : 1
  const outputBits = prepared.space.kind === 'indexed' && state.destination === 'gray' ? prepared.bits : 8
  dictionary.DecodeParms = state.document.context.obj({ Predictor: 15, Colors: outputChannels, Columns: width, BitsPerComponent: outputBits })
  const replacement = state.document.context.stream(deflateSync(pngPredictor(output, width, height, outputChannels, outputBits)), dictionary)
  state.converted.set(image, { ...variants, [context]: replacement })
  countSuppliedImage(state, image, mask)
  return replacement
}

export const convertedImageCount = (state: ImageState): number => state.total
