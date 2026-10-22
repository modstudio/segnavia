import { inflateSync } from 'node:zlib'
import { RenderRefusedError } from '../errors.ts'

const whitespace = (value: string | undefined): boolean => value !== undefined && /[\0\t\n\f\r ]/.test(value)
const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}

export interface InlineImage {
  bits: number
  colorSpace?: string
  dataAt: number
  dataEnd: number
  decodeParms?: Record<string, number>
  end: number
  filter?: string
  header: string
  height: number
  imageMask: boolean
  width: number
}

export interface InlineImageHeader {
  colorSpace?: string
  imageMask: boolean
}

const value = (header: string, short: string, long: string): string | undefined =>
  new RegExp(`/(?:${short}|${long})(?:\\s+|(?=/))(<<[^>]*>>|\\[[^\\]]*\\]|/[^\\s]+|[^\\s]+)`).exec(header)?.[1]

export function binaryString(bytes: Uint8Array): string {
  let output = ''
  for (let at = 0; at < bytes.length; at += 32_768) output += String.fromCharCode(...bytes.subarray(at, Math.min(bytes.length, at + 32_768)))
  return output
}

function numberValue(header: string, short: string, long: string): number | undefined {
  const found = value(header, short, long)
  return found === undefined ? undefined : Number(found)
}

function decodeParms(header: string): Record<string, number> | undefined {
  const raw = value(header, 'DP', 'DecodeParms')
  if (!raw) return undefined
  if (!raw.startsWith('<<')) return refuse('inline image DecodeParms', 'a PNG predictor dictionary')
  const output: Record<string, number> = {}
  for (const name of ['Predictor', 'Colors', 'Columns', 'BitsPerComponent']) {
    const found = new RegExp(`/${name}\\s+(\\d+)`).exec(raw)?.[1]
    if (found !== undefined) output[name] = Number(found)
  }
  return output
}

function components(colorSpace: string | undefined, imageMask: boolean): number | undefined {
  if (imageMask) return 1
  const name = colorSpace?.replace('/', '')
  if (name === 'G' || name === 'DeviceGray') return 1
  if (name === 'RGB' || name === 'DeviceRGB') return 3
  if (name === 'CMYK' || name === 'DeviceCMYK') return 4
  return undefined
}

function candidateEnd(source: string, dataAt: number, expected: number, filter: string | undefined): number {
  const clears = 'Width, Height, BitsPerComponent, a direct device ColorSpace, and no filter or FlateDecode'
  if (!Number.isSafeInteger(expected) || expected < 0) return refuse('inline image sample geometry', clears)
  if (!filter) {
    const end = dataAt + expected
    if (!whitespace(source[end]) || source.slice(end + 1, end + 3) !== 'EI') return refuse('inline image data extent', clears)
    return end
  }
  if (filter !== 'Fl' && filter !== 'FlateDecode') return refuse(`inline image ${filter} data extent`, clears)
  const match = /[\0\t\n\f\r ]EI(?=[\0\t\n\f\r ()<>[\]{}/%]|$)/g
  match.lastIndex = dataAt
  for (let found = match.exec(source); found; found = match.exec(source)) {
    try {
      const decoded = inflateSync(Buffer.from(source.slice(dataAt, found.index), 'latin1'), { maxOutputLength: expected })
      if (decoded.length === expected) return found.index
    } catch {
      // A delimiter inside compressed bytes is not the inline image boundary.
    }
  }
  return refuse('inline image FlateDecode data extent', `${expected} decoded sample bytes followed by EI`)
}

export function inlineImageHeader(source: string, start: number): InlineImageHeader {
  const id = /\sID(?=[\0\t\n\f\r ])/g
  id.lastIndex = start
  const foundId = id.exec(source)
  if (!foundId) return refuse('truncated BI operator', 'an ID and EI pair')
  const header = source.slice(start, foundId.index)
  return { colorSpace: value(header, 'CS', 'ColorSpace'), imageMask: value(header, 'IM', 'ImageMask') === 'true' }
}

export function parseInlineImage(source: string, start: number): InlineImage {
  const id = /\sID(?=[\0\t\n\f\r ])/g
  id.lastIndex = start
  const foundId = id.exec(source)
  if (!foundId) return refuse('truncated BI operator', 'an ID and EI pair')
  let dataAt = foundId.index + foundId[0].length
  if (whitespace(source[dataAt])) dataAt++
  const header = source.slice(start, foundId.index)
  const width = numberValue(header, 'W', 'Width')
  const height = numberValue(header, 'H', 'Height')
  const bits = numberValue(header, 'BPC', 'BitsPerComponent')
  const colorSpace = value(header, 'CS', 'ColorSpace')
  const imageMask = value(header, 'IM', 'ImageMask') === 'true'
  const channels = components(colorSpace, imageMask)
  if (!width || !height || !bits || !channels || !Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(bits))
    return refuse('inline image sample geometry', 'positive integer Width, Height, BitsPerComponent, and a direct device ColorSpace')
  const parms = decodeParms(header)
  const rowBytes = Math.ceil((width * channels * bits) / 8)
  const predictor = parms?.Predictor ?? 1
  if (predictor !== 1 && (predictor < 10 || predictor > 15))
    return refuse(`inline image predictor ${predictor}`, 'no predictor or a PNG predictor 10 through 15')
  if (predictor >= 10 && ((parms?.Colors ?? 1) !== channels || (parms?.Columns ?? 1) !== width || (parms?.BitsPerComponent ?? 8) !== bits))
    return refuse('inline image PNG predictor parameters', `Colors ${channels}, Columns ${width}, and BitsPerComponent ${bits}`)
  const expected = height * (rowBytes + (predictor >= 10 && predictor <= 15 ? 1 : 0))
  const filter = value(header, 'F', 'Filter')?.replace('/', '')
  const dataEnd = candidateEnd(source, dataAt, expected, filter)
  return { bits, colorSpace, dataAt, dataEnd, decodeParms: parms, end: dataEnd + 3, filter, header, height, imageMask, width }
}
