import { align4, fixed, need, signature, type TagBounds, u16, u32 } from './binary.ts'
import { interpolate, linearGrid, matrixInput, multilinear, type Samples, tetrahedral4 } from './interpolation.ts'
import { invert3, matrix3 } from './spaces.ts'
import { type ChannelCount, type ColorTable, type Curve, checked, clamp, type Matrix3, REVERSE_LUT, refuse } from './types.ts'

export interface TagRecord extends TagBounds {
  offset: number
  size: number
  type: string
}

function packed(bytes: Uint8Array, view: DataView, offset: number, length: number, width: 1 | 2, bounds: TagBounds): Samples {
  need(offset, length * width, bounds)
  return {
    length,
    get(index) {
      if (!Number.isInteger(index) || index < 0 || index >= length) throw new Error(`${bounds.name} sample index ${index} is outside length ${length}`)
      return width === 1 ? checked(bytes, offset + index, `${bounds.name} samples`) / 255 : u16(view, offset + index * 2, bounds) / 65_535
    },
  }
}

const parametric: Array<(p: number[], x: number) => number> = [
  (p, x) => clamp(x) ** checked(p, 0, 'parametric curve'),
  (p, x) => {
    const g = checked(p, 0, 'parametric curve'),
      a = checked(p, 1, 'parametric curve'),
      b = checked(p, 2, 'parametric curve')
    return x >= -b / a ? (a * x + b) ** g : 0
  },
  (p, x) => {
    const g = checked(p, 0, 'parametric curve'),
      a = checked(p, 1, 'parametric curve'),
      b = checked(p, 2, 'parametric curve'),
      c = checked(p, 3, 'parametric curve')
    return x >= -b / a ? (a * x + b) ** g + c : c
  },
  (p, x) => {
    const g = checked(p, 0, 'parametric curve'),
      a = checked(p, 1, 'parametric curve'),
      b = checked(p, 2, 'parametric curve'),
      c = checked(p, 3, 'parametric curve'),
      d = checked(p, 4, 'parametric curve')
    return x >= d ? (a * x + b) ** g : c * x
  },
  (p, x) => {
    const g = checked(p, 0, 'parametric curve'),
      a = checked(p, 1, 'parametric curve'),
      b = checked(p, 2, 'parametric curve'),
      c = checked(p, 3, 'parametric curve'),
      d = checked(p, 4, 'parametric curve'),
      e = checked(p, 5, 'parametric curve'),
      f = checked(p, 6, 'parametric curve')
    return x >= d ? (a * x + b) ** g + e : c * x + f
  },
]

export function parseCurve(bytes: Uint8Array, view: DataView, offset: number, bounds: TagBounds): { curve: Curve; size: number } {
  need(offset, 12, bounds)
  const type = signature(bytes, offset, bounds)
  if (type === 'curv') {
    const count = u32(view, offset + 8, bounds)
    need(offset + 12, count * 2, bounds)
    if (count === 0) return { curve: (value) => value, size: 12 }
    if (count === 1) {
      const gamma = u16(view, offset + 12, bounds) / 256
      return { curve: (value) => clamp(value) ** gamma, size: 14 }
    }
    const values = packed(bytes, view, offset + 12, count, 2, bounds)
    return { curve: (value) => interpolate(values, value), size: 12 + count * 2 }
  }
  if (type !== 'para') return refuse(`curve tag type ${JSON.stringify(type)}`, 'curv or para')
  const kind = u16(view, offset + 8, bounds),
    counts = [1, 3, 4, 5, 7]
  if (kind > 4) refuse(`parametric curve function ${kind}`, 'functions 0 through 4')
  const count = checked(counts, kind, 'parametric curve function')
  need(offset + 12, count * 4, bounds)
  const parameters = Array.from({ length: count }, (_, index) => fixed(view, offset + 12 + index * 4, bounds))
  const evaluate = checked(parametric, kind, 'parametric curve function')
  return { curve: (value) => evaluate(parameters, value), size: 12 + count * 4 }
}

export function invertCurve(curve: Curve, target: number): number {
  let low = 0,
    high = 1
  for (let index = 0; index < 24; index++) {
    const middle = (low + high) / 2
    if (curve(middle) < target) low = middle
    else high = middle
  }
  return (low + high) / 2
}

function curvesAt(bytes: Uint8Array, view: DataView, offset: number, count: number, bounds: TagBounds): Curve[] {
  const curves: Curve[] = []
  let cursor = offset
  for (let index = 0; index < count; index++) {
    const parsed = parseCurve(bytes, view, cursor, bounds)
    curves.push(parsed.curve)
    cursor = align4(cursor + parsed.size)
  }
  return curves
}

function channels(bytes: Uint8Array, offset: number, expectedInputs: number, expectedOutputs: number, bounds: TagBounds): void {
  need(offset + 8, 2, bounds)
  const inputs = checked(bytes, offset + 8, `${bounds.name} header`),
    outputs = checked(bytes, offset + 9, `${bounds.name} header`)
  if (inputs !== expectedInputs || outputs !== expectedOutputs)
    refuse(`${bounds.name} channel count ${inputs}->${outputs}`, `${expectedInputs}->${expectedOutputs}`)
}

export function parseMft(bytes: Uint8Array, view: DataView, record: TagRecord, type: 'mft1' | 'mft2', inputs: ChannelCount, outputs: ChannelCount): ColorTable {
  const { offset } = record
  need(offset, type === 'mft1' ? 48 : 52, record)
  channels(bytes, offset, inputs, outputs, record)
  const pointCount = checked(bytes, offset + 10, `${type} header`)
  if (pointCount < 2) refuse(`${type} grid point count ${pointCount}`, 'at least 2')
  const matrix = Array.from({ length: 9 }, (_, index) => fixed(view, offset + 12 + index * 4, record))
  const inputEntries = type === 'mft1' ? 256 : u16(view, offset + 48, record),
    outputEntries = type === 'mft1' ? 256 : u16(view, offset + 50, record)
  if (inputEntries < 2 || outputEntries < 2) refuse(`${type} table entry counts ${inputEntries}/${outputEntries}`, 'at least 2 entries')
  const width: 1 | 2 = type === 'mft1' ? 1 : 2
  let cursor = offset + (type === 'mft1' ? 48 : 52)
  const inputTables = Array.from({ length: inputs }, () => {
    const result = packed(bytes, view, cursor, inputEntries, width, record)
    cursor += inputEntries * width
    return result
  })
  const gridLength = pointCount ** inputs * outputs,
    grid = packed(bytes, view, cursor, gridLength, width, record)
  cursor += gridLength * width
  const outputTables = Array.from({ length: outputs }, () => {
    const result = packed(bytes, view, cursor, outputEntries, width, record)
    cursor += outputEntries * width
    return result
  })
  const points = Array.from({ length: inputs }, () => pointCount)
  return {
    inputChannels: inputs,
    outputChannels: outputs,
    encoding: type,
    run(values) {
      let current: readonly number[] = values.map((value, channel) => interpolate(checked(inputTables, channel, `${type} input tables`), value))
      if (inputs === 3) {
        const fixedMatrix: Matrix3 = [
          checked(matrix, 0, `${type} matrix`),
          checked(matrix, 1, `${type} matrix`),
          checked(matrix, 2, `${type} matrix`),
          checked(matrix, 3, `${type} matrix`),
          checked(matrix, 4, `${type} matrix`),
          checked(matrix, 5, `${type} matrix`),
          checked(matrix, 6, `${type} matrix`),
          checked(matrix, 7, `${type} matrix`),
          checked(matrix, 8, `${type} matrix`),
        ]
        current = matrix3(fixedMatrix, matrixInput(current))
      }
      current =
        inputs === 1
          ? linearGrid(grid, points, outputs, current)
          : inputs === 3
            ? multilinear(grid, points, outputs, current)
            : tetrahedral4(grid, points, outputs, current)
      return current.map((value, channel) => interpolate(checked(outputTables, channel, `${type} output tables`), value))
    },
  }
}

function mabGrid(bytes: Uint8Array, view: DataView, record: TagRecord, type: string, offset: number, inputs: number, outputs: number) {
  if (!offset) return { points: [] as number[], grid: undefined }
  need(offset, 20, record)
  const points = Array.from(bytes.subarray(offset, offset + inputs))
  const badPoint = points.find((point) => point < 2)
  if (badPoint !== undefined) refuse(`${type} CLUT grid point count ${badPoint}`, 'at least 2')
  const precision = checked(bytes, offset + 16, `${type} CLUT`)
  if (precision !== 1 && precision !== 2) refuse(`${type} CLUT precision ${precision}`, '1 or 2 bytes')
  return {
    points,
    grid: packed(
      bytes,
      view,
      offset + 20,
      points.reduce((a, b) => a * b, outputs),
      precision,
      record,
    ),
  }
}

export function parseMab(
  bytes: Uint8Array,
  view: DataView,
  record: TagRecord,
  type: 'mAB ' | typeof REVERSE_LUT,
  inputs: ChannelCount,
  outputs: ChannelCount,
): ColorTable {
  const { offset } = record
  need(offset, 32, record)
  channels(bytes, offset, inputs, outputs, record)
  const relative = (at: number) => {
    const value = u32(view, offset + at, record),
      absolute = value === 0 ? 0 : offset + value
    if (absolute) need(absolute, 1, record)
    return absolute
  }
  const bOffset = relative(12),
    matrixOffset = relative(16),
    mOffset = relative(20),
    clutOffset = relative(24),
    aOffset = relative(28)
  const bCurves = bOffset ? curvesAt(bytes, view, bOffset, type === 'mAB ' ? outputs : inputs, record) : []
  const mCurves = mOffset ? curvesAt(bytes, view, mOffset, type === 'mAB ' ? outputs : inputs, record) : []
  const aCurves = aOffset ? curvesAt(bytes, view, aOffset, type === 'mAB ' ? inputs : outputs, record) : []
  if (matrixOffset) need(matrixOffset, 48, record)
  const matrix = matrixOffset ? Array.from({ length: 12 }, (_, index) => fixed(view, matrixOffset + index * 4, record)) : []
  const { points, grid } = mabGrid(bytes, view, record, type, clutOffset, inputs, outputs)
  const apply = (curves: Curve[], values: readonly number[]) =>
    curves.length ? values.map((value, index) => checked(curves, index, `${type} curves`)(value)) : [...values]
  const applyMatrix = (values: readonly number[]) => {
    if (!matrix.length) return [...values]
    const [x, y, z] = matrixInput(values)
    return [0, 1, 2].map(
      (row) =>
        checked(matrix, row * 3, `${type} matrix`) * x +
        checked(matrix, row * 3 + 1, `${type} matrix`) * y +
        checked(matrix, row * 3 + 2, `${type} matrix`) * z +
        checked(matrix, 9 + row, `${type} matrix`),
    )
  }
  const clut = (values: readonly number[]) =>
    !grid
      ? [...values]
      : inputs === 1
        ? linearGrid(grid, points, outputs, values)
        : inputs === 3
          ? multilinear(grid, points, outputs, values)
          : tetrahedral4(grid, points, outputs, values)
  return {
    inputChannels: inputs,
    outputChannels: outputs,
    encoding: type,
    run(values) {
      return type === 'mAB '
        ? apply(bCurves, applyMatrix(apply(mCurves, clut(apply(aCurves, values)))))
        : apply(aCurves, clut(apply(mCurves, applyMatrix(apply(bCurves, values)))))
    },
  }
}

export function matrixTables(bytes: Uint8Array, view: DataView, records: Record<string, TagRecord>): { a2b: ColorTable; b2a: ColorTable } | undefined {
  const names = ['rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC']
  if (!names.every((name) => records[name])) return undefined
  const record = (name: string) => {
    const found = records[name]
    if (!found) throw new Error(`ICC profile is missing ${name} after its tag set was validated`)
    return found
  }
  for (const name of names.slice(0, 3)) if (record(name).type !== 'XYZ ') refuse(`${name} tag type ${record(name).type}`, 'XYZ ')
  const columns = names.slice(0, 3).map((name) => {
    const tag = record(name)
    need(tag.offset, 20, tag)
    return [fixed(view, tag.offset + 8, tag), fixed(view, tag.offset + 12, tag), fixed(view, tag.offset + 16, tag)]
  })
  const curves = names.slice(3).map((name) => parseCurve(bytes, view, record(name).offset, record(name)).curve)
  const matrix: Matrix3 = [
    checked(checked(columns, 0, 'colorants'), 0, 'red'),
    checked(checked(columns, 1, 'colorants'), 0, 'green'),
    checked(checked(columns, 2, 'colorants'), 0, 'blue'),
    checked(checked(columns, 0, 'colorants'), 1, 'red'),
    checked(checked(columns, 1, 'colorants'), 1, 'green'),
    checked(checked(columns, 2, 'colorants'), 1, 'blue'),
    checked(checked(columns, 0, 'colorants'), 2, 'red'),
    checked(checked(columns, 1, 'colorants'), 2, 'green'),
    checked(checked(columns, 2, 'colorants'), 2, 'blue'),
  ]
  const inverse = invert3(matrix)
  return {
    a2b: {
      inputChannels: 3,
      outputChannels: 3,
      encoding: 'mAB ',
      run: (input) => matrix3(matrix, matrixInput(input.map((value, index) => checked(curves, index, 'RGB curves')(value)))),
    },
    b2a: {
      inputChannels: 3,
      outputChannels: 3,
      encoding: REVERSE_LUT,
      run: (input) => matrix3(inverse, matrixInput(input)).map((value, index) => invertCurve(checked(curves, index, 'RGB curves'), value)),
    },
  }
}

export function grayTables(bytes: Uint8Array, view: DataView, record: TagRecord, pcs: 'Lab ' | 'XYZ '): { a2b: ColorTable; b2a: ColorTable } {
  const curve = parseCurve(bytes, view, record.offset, record).curve
  const scale = 32_768 / 65_535
  return {
    a2b: {
      inputChannels: 1,
      outputChannels: 3,
      encoding: 'mAB ',
      run(input) {
        const luminance = curve(checked(input, 0, 'gray input'))
        if (pcs === 'XYZ ') return [luminance * 0.9642 * scale, luminance * scale, luminance * 0.8249 * scale]
        // LittleCMS treats a gray TRC in Lab PCS as normalized L*, rather than converting its result from Y.
        return [luminance, 128 / 255, 128 / 255]
      },
    },
    b2a: {
      inputChannels: 3,
      outputChannels: 1,
      encoding: REVERSE_LUT,
      run(input) {
        // LittleCMS inverts PCS Y for XYZ, but normalized L* for Lab gray profiles.
        const luminance = pcs === 'XYZ ' ? checked(input, 1, 'gray PCS input') / scale : checked(input, 0, 'gray PCS input')
        return [invertCurve(curve, luminance)]
      },
    },
  }
}
