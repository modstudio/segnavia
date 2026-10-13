// @ts-nocheck -- The test builder writes fixed-dimension ICC structures.
type Encoding = 'mft1' | 'mft2'

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

function deviceToLab(device: number[], floor: number): number[] {
  const [c, m, y, k] = device
  const ink = 1 - (1 - k) * (1 - (0.08 * (c + m + y)) / 3)
  return [(floor + (1 - floor) * (1 - ink)) * 100, 0, 0]
}

function labToDevice(lab: number[], floor: number): number[] {
  return [0, 0, 0, 1 - (lab[0] / 100 - floor) / (1 - floor)]
}

function decodeLab(values: number[]): number[] {
  return [values[0] * 100, values[1] * 255 - 128, values[2] * 255 - 128]
}

function encodeLab(values: number[]): number[] {
  return [values[0] / 100, (values[1] + 128) / 255, (values[2] + 128) / 255].map((value) => Math.max(0, Math.min(1, value)))
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

function profile(tags: Array<[string, Uint8Array]>): Uint8Array {
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
  bytes[8] = 2
  bytes[9] = 0x20
  signature(bytes, 12, 'prtr')
  signature(bytes, 16, 'CMYK')
  signature(bytes, 20, 'Lab ')
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
    view.setUint32(at + 4, offsets[index], false)
    view.setUint32(at + 8, data.length, false)
    bytes.set(data, offsets[index])
  })
  return bytes
}

export function buildPressProfile(encoding: Encoding, floor = 0): Uint8Array {
  const legacy = encoding === 'mft2' ? 65_280 / 65_535 : 1
  const a2b = lut(encoding, 4, 3, 9, (device) => encodeLab(deviceToLab(device, floor)).map((value) => value * legacy))
  const b2a = lut(encoding, 3, 4, 17, (encoded) => labToDevice(decodeLab(encoded.map((value) => value / legacy)), floor))
  const gamut = lut(encoding, 3, 1, 5, () => [0])
  return profile([
    ['A2B0', a2b],
    ['A2B1', a2b],
    ['B2A0', b2a],
    ['B2A1', b2a],
    ['gamt', gamut],
    ['wtpt', xyzTag()],
  ])
}
