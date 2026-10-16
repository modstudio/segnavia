import { type Color3, type Color4, checked, color3, color4 } from './types.ts'

type Encoding = 'mft1' | 'mft2'
export type GrayEncoding = Encoding | 'mBA ' | 'trc-gamma' | 'trc-sampled' | 'trc-descending' | 'trc-para'

const align4 = (value: number) => (value + 3) & ~3
const signature = (bytes: Uint8Array, offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset)

function fixed(view: DataView, offset: number, value: number): void {
  view.setInt32(offset, Math.round(value * 65_536), false)
}

function xyzTag(): Uint8Array {
  const bytes = new Uint8Array(20),
    view = new DataView(bytes.buffer)
  signature(bytes, 0, 'XYZ ')
  fixed(view, 8, 0.9642)
  fixed(view, 12, 1)
  fixed(view, 16, 0.8249)
  return bytes
}

// This fixture restates D50 and ICC Lab table encoding so the oracle side remains independent of the engine implementation.
function deviceToLab(device: Color4, floor: number): Color3 {
  const [c, m, y, k] = device
  const ink = 1 - (1 - k) * (1 - (0.08 * (c + m + y)) / 3)
  return [(floor + (1 - floor) * (1 - ink)) * 100, (m - c) * 1.5 * (1 - k), (y - (c + m) / 2) * 1.2 * (1 - k)]
}

function labToDevice(lab: Color3, floor: number): Color4 {
  const [lightness, a, b] = lab
  const clip = (value: number) => Math.max(0, Math.min(1, value))
  const black = clip(1 - (lightness / 100 - floor) / (1 - floor))
  const chroma = 1 - black
  return [clip((-a / 1.5 - b / 2.4) * chroma), clip((a / 1.5 - b / 2.4) * chroma), clip((b / 1.2) * chroma), black]
}

function decodeLab(values: Color3): Color3 {
  return [values[0] * 100, values[1] * 255 - 128, values[2] * 255 - 128]
}

function encodeLab(values: Color3): Color3 {
  const [lightness, a, b] = values
  const clip = (value: number) => Math.max(0, Math.min(1, value))
  return [clip(lightness / 100), clip((a + 128) / 255), clip((b + 128) / 255)]
}

function lut(encoding: Encoding, inputs: number, outputs: number, points: number, transform: (input: number[]) => number[]): Uint8Array {
  const entries = encoding === 'mft1' ? 256 : 256
  const width = encoding === 'mft1' ? 1 : 2
  const header = encoding === 'mft1' ? 48 : 52
  const count = inputs * entries + points ** inputs * outputs + outputs * entries
  const bytes = new Uint8Array(header + count * width),
    view = new DataView(bytes.buffer)
  signature(bytes, 0, encoding)
  bytes[8] = inputs
  bytes[9] = outputs
  bytes[10] = points
  for (let index = 0; index < 9; index++) fixed(view, 12 + index * 4, index % 4 === 0 ? 1 : 0)
  if (encoding === 'mft2') {
    view.setUint16(48, entries, false)
    view.setUint16(50, entries, false)
  }
  let cursor = header
  const write = (value: number) => {
    const clipped = Math.max(0, Math.min(1, value))
    if (width === 1) bytes[cursor] = Math.round(clipped * 255)
    else view.setUint16(cursor, Math.round(clipped * 65_535), false)
    cursor += width
  }
  for (let channel = 0; channel < inputs; channel++) for (let index = 0; index < entries; index++) write(index / (entries - 1))
  const visit = (values: number[]) => {
    if (values.length === inputs) for (const value of transform(values)) write(value)
    else for (let index = 0; index < points; index++) visit([...values, index / (points - 1)])
  }
  visit([])
  for (let channel = 0; channel < outputs; channel++) for (let index = 0; index < entries; index++) write(index / (entries - 1))
  return bytes
}

function profile(tags: Array<[string, Uint8Array]>, colorSpace = 'CMYK', pcs = 'Lab ', major: 2 | 4 = 2): Uint8Array {
  const tableEnd = 132 + tags.length * 12
  let cursor = align4(tableEnd)
  const offsets = tags.map(([, data]) => {
    const result = cursor
    cursor = align4(cursor + data.length)
    return result
  })
  const bytes = new Uint8Array(cursor),
    view = new DataView(bytes.buffer)
  view.setUint32(0, bytes.length, false)
  bytes[8] = major
  bytes[9] = 0x20
  signature(bytes, 12, 'prtr')
  signature(bytes, 16, colorSpace)
  signature(bytes, 20, pcs)
  signature(bytes, 36, 'acsp')
  signature(bytes, 40, 'APPL')
  view.setUint32(64, 1, false)
  fixed(view, 68, 0.9642)
  fixed(view, 72, 1)
  fixed(view, 76, 0.8249)
  signature(bytes, 80, 'SEGN')
  view.setUint32(128, tags.length, false)
  tags.forEach(([name, data], index) => {
    const at = 132 + index * 12
    signature(bytes, at, name)
    view.setUint32(at + 4, checked(offsets, index, 'profile tag offsets'), false)
    view.setUint32(at + 8, data.length, false)
    bytes.set(data, checked(offsets, index, 'profile tag offsets'))
  })
  return bytes
}

function curveTag(kind: 'gamma' | 'sampled' | 'descending' | 'para', floor = 0): Uint8Array {
  if (kind === 'para') {
    const bytes = new Uint8Array(16),
      view = new DataView(bytes.buffer)
    signature(bytes, 0, 'para')
    view.setUint16(8, 0, false)
    fixed(view, 12, 2.2)
    return bytes
  }
  const count = kind === 'gamma' ? 1 : 33
  const bytes = new Uint8Array(12 + count * 2),
    view = new DataView(bytes.buffer)
  signature(bytes, 0, 'curv')
  view.setUint32(8, count, false)
  if (kind === 'gamma') view.setUint16(12, Math.round(2.2 * 256), false)
  else
    for (let index = 0; index < count; index++) {
      const input = index / (count - 1),
        value = kind === 'descending' ? 1 - input : floor + (1 - floor) * input ** 2.2
      view.setUint16(12 + index * 2, Math.round(value * 65_535), false)
    }
  return bytes
}

const grayFromPcs = (encoded: number[], pcs: 'Lab ' | 'XYZ ') => {
  // LittleCMS gives monochrome Lab profiles normalized L*, while XYZ profiles use Y.
  const luminance = pcs === 'XYZ ' ? checked(encoded, 1, 'fixture XYZ input') * (65_535 / 32_768) : checked(encoded, 0, 'fixture Lab input')
  return Math.max(0, Math.min(1, luminance)) ** (1 / 2.2)
}

function mbaGray(pcs: 'Lab ' | 'XYZ '): Uint8Array {
  const points = 65,
    bytes = new Uint8Array(32 + 20 + points ** 3),
    view = new DataView(bytes.buffer)
  signature(bytes, 0, 'mBA ')
  bytes[8] = 3
  bytes[9] = 1
  view.setUint32(24, 32, false)
  bytes.fill(points, 32, 35)
  bytes[48] = 1
  let cursor = 52
  for (let first = 0; first < points; first++)
    for (let second = 0; second < points; second++)
      for (let third = 0; third < points; third++)
        bytes[cursor++] = Math.round(grayFromPcs([first / (points - 1), second / (points - 1), third / (points - 1)], pcs) * 255)
  return bytes
}

export function buildGrayProfile(encoding: GrayEncoding, pcs: 'Lab ' | 'XYZ ' = 'XYZ ', floor = 0): Uint8Array {
  const curveKind = encoding === 'trc-sampled' ? 'sampled' : encoding === 'trc-descending' ? 'descending' : encoding === 'trc-para' ? 'para' : 'gamma'
  const tags: Array<[string, Uint8Array]> = [['kTRC', curveTag(curveKind, floor)]]
  if (encoding === 'mft1' || encoding === 'mft2') tags.push(['B2A1', lut(encoding, 3, 1, 65, (input) => [grayFromPcs(input, pcs)])])
  if (encoding === 'mBA ') tags.push(['B2A1', mbaGray(pcs)])
  tags.push(['wtpt', xyzTag()])
  return profile(tags, 'GRAY', pcs, 4)
}

function pressTags(
  encoding: Encoding,
  floor: number,
  a2bPoints: number,
): { relativeA2b: Uint8Array; perceptualA2b: Uint8Array; relativeB2a: Uint8Array; perceptualB2a: Uint8Array; gamut: Uint8Array } {
  const legacy = encoding === 'mft2' ? 65_280 / 65_535 : 1
  const a2b = (perceptual: boolean) =>
    lut(encoding, 4, 3, a2bPoints, (device) => {
      const [lightness, a, b] = deviceToLab(color4(device, 'fixture CMYK input'), floor)
      const lab: Color3 = perceptual ? [lightness * 0.9 + 5, a * 0.8, b * 0.8] : [lightness, a, b]
      return encodeLab(lab).map((value) => value * legacy)
    })
  const b2a = (perceptual: boolean) =>
    lut(encoding, 3, 4, 17, (encoded) => {
      const [lightness, a, b] = decodeLab(
        color3(
          encoded.map((value) => value / legacy),
          'fixture Lab input',
        ),
      )
      const lab: Color3 = perceptual ? [(lightness - 5) / 0.9, a / 0.8, b / 0.8] : [lightness, a, b]
      return labToDevice(lab, floor)
    })
  const gamut = lut(encoding, 3, 1, 5, () => [0])
  return { relativeA2b: a2b(false), perceptualA2b: a2b(true), relativeB2a: b2a(false), perceptualB2a: b2a(true), gamut }
}

export function buildPressProfile(encoding: Encoding, floor = 0): Uint8Array {
  const tags = pressTags(encoding, floor, 9)
  return profile([
    ['A2B0', tags.perceptualA2b],
    ['A2B1', tags.relativeA2b],
    ['B2A0', tags.perceptualB2a],
    ['B2A1', tags.relativeB2a],
    ['gamt', tags.gamut],
    ['wtpt', xyzTag()],
  ])
}

export function buildLargePressProfile(): Uint8Array {
  const tags = pressTags('mft1', 0, 33)
  return profile([
    ['A2B1', tags.relativeA2b],
    ['B2A1', tags.relativeB2a],
    ['gamt', tags.gamut],
    ['wtpt', xyzTag()],
  ])
}
