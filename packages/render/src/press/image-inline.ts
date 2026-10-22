import { PDFName, type PDFRawStream } from 'pdf-lib'
import { RenderRefusedError } from '../errors.ts'
import { convertSuppliedImage, type ImageState } from './image.ts'
import type { MaskContext } from './visitor.ts'

const decoder = new TextDecoder('latin1')
const encoder = new TextEncoder()
const refuse = (found: string, supported: string): never => {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}
const value = (header: string, short: string, long: string): string | undefined =>
  new RegExp(`/(?:${short}|${long})\\s+(<<[^>]*>>|\\[[^\\]]*\\]|/[^\\s]+|[^\\s]+)`).exec(header)?.[1]
const numberValue = (header: string, short: string, long: string): number | undefined => {
  const found = value(header, short, long)
  return found === undefined ? undefined : Number(found)
}

function inlineEnd(source: string, start: number): { dataAt: number; end: number; header: string; imageEnd: number } {
  const id = /\sID(?=[\0\t\n\f\r ])/g
  id.lastIndex = start
  const foundId = id.exec(source)
  if (!foundId) return refuse('truncated BI operator', 'an ID and EI pair')
  let dataAt = foundId.index + foundId[0].length
  if (/^[\0\t\n\f\r ]$/.test(source[dataAt] ?? '')) dataAt++
  const ei = /[\0\t\n\f\r ]EI(?=[\0\t\n\f\r ()<>[\]{}/%]|$)/g
  ei.lastIndex = dataAt
  const foundEi = ei.exec(source)
  if (!foundEi) return refuse('truncated BI operator', 'an ID and EI pair')
  return { dataAt, end: foundEi.index, header: source.slice(start, foundId.index), imageEnd: foundEi.index + foundEi[0].length }
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

async function convertOne(state: ImageState, header: string, bytes: Uint8Array, mask: MaskContext): Promise<PDFRawStream | undefined> {
  const color = value(header, 'CS', 'ColorSpace')?.replace('/', '')
  const imageMask = value(header, 'IM', 'ImageMask') === 'true'
  if (imageMask || color === 'G' || color === 'DeviceGray' || color === 'CMYK' || color === 'DeviceCMYK') return undefined
  if (color !== 'RGB' && color !== 'DeviceRGB') return refuse(`inline image color space ${color ?? 'missing'}`, 'DeviceRGB, DeviceGray, or DeviceCMYK')
  const width = numberValue(header, 'W', 'Width')
  const height = numberValue(header, 'H', 'Height')
  const bits = numberValue(header, 'BPC', 'BitsPerComponent')
  const filter = value(header, 'F', 'Filter')?.replace('/', '')
  const dictionary: Record<string, unknown> = {
    Type: 'XObject',
    Subtype: 'Image',
    Width: width,
    Height: height,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: bits,
  }
  if (filter) dictionary.Filter = filter === 'Fl' ? 'FlateDecode' : filter === 'DCT' ? 'DCTDecode' : filter
  const parms = decodeParms(header)
  if (parms) dictionary.DecodeParms = parms
  return convertSuppliedImage(state, state.document.context.stream(bytes, dictionary as never), mask)
}

export async function convertInlineImages(state: ImageState, bytes: Uint8Array, mask: MaskContext): Promise<Uint8Array | undefined> {
  const source = decoder.decode(bytes)
  const pattern = /(?:^|[\0\t\n\f\r ])BI(?=[\0\t\n\f\r ])/g
  const parts: Uint8Array[] = []
  let inputAt = 0
  let changed = false
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    const start = match.index + match[0].length - 2
    const found = inlineEnd(source, start + 2)
    const replacement = await convertOne(state, found.header, bytes.subarray(found.dataAt, found.end), mask)
    pattern.lastIndex = found.imageEnd
    if (!replacement) continue
    parts.push(bytes.subarray(inputAt, start))
    const width = replacement.dict.get(PDFName.of('Width'))?.toString()
    const height = replacement.dict.get(PDFName.of('Height'))?.toString()
    const channels = replacement.dict.get(PDFName.of('ColorSpace'))?.toString() === '/DeviceCMYK' ? 4 : 1
    parts.push(
      encoder.encode(
        `BI /W ${width} /H ${height} /CS /${channels === 4 ? 'CMYK' : 'G'} /BPC 8 /F /FlateDecode /DP << /Predictor 15 /Colors ${channels} /Columns ${width} /BitsPerComponent 8 >> ID\n`,
      ),
    )
    parts.push(replacement.contents, encoder.encode('\nEI'))
    inputAt = found.imageEnd
    changed = true
  }
  if (!changed) return undefined
  parts.push(bytes.subarray(inputAt))
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    output.set(part, at)
    at += part.length
  }
  return output
}
