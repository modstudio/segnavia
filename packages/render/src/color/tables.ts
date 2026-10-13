// @ts-nocheck -- Table dimensions are validated before indexed interpolation.
import { invert3, matrix3 } from './spaces.ts'
import { type Color, type ColorTable, type Curve, clamp, REVERSE_LUT, refuse } from './types.ts'

export const signature = (bytes: Uint8Array, offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4))
export const u16 = (view: DataView, offset: number): number => view.getUint16(offset, false)
export const u32 = (view: DataView, offset: number): number => view.getUint32(offset, false)
export const fixed = (view: DataView, offset: number): number => view.getInt32(offset, false) / 65_536
const align4 = (value: number) => (value + 3) & ~3

function need(bytes: Uint8Array, offset: number, length: number, structure: string): void {
  if (offset < 0 || length < 0 || offset + length > bytes.length) refuse(`truncated ${structure}`, `${structure} contained within the profile`)
}

const parametric: Array<(p: number[], x: number) => number> = [
  ([g], x) => clamp(x) ** g,
  ([g, a, b], x) => (x >= -b / a ? (a * x + b) ** g : 0),
  ([g, a, b, c], x) => (x >= -b / a ? (a * x + b) ** g + c : c),
  ([g, a, b, c, d], x) => (x >= d ? (a * x + b) ** g : c * x),
  ([g, a, b, c, d, e, f], x) => (x >= d ? (a * x + b) ** g + e : c * x + f),
]

export function parseCurve(bytes: Uint8Array, view: DataView, offset: number): { curve: Curve; size: number } {
  need(bytes, offset, 12, 'curve')
  const type = signature(bytes, offset)
  if (type === 'curv') {
    const count = u32(view, offset + 8)
    need(bytes, offset + 12, count * 2, 'curve values')
    if (count === 0) return { curve: (value) => value, size: 12 }
    if (count === 1) {
      const gamma = u16(view, offset + 12) / 256
      return { curve: (value) => clamp(value) ** gamma, size: 14 }
    }
    const values = Array.from({ length: count }, (_, index) => u16(view, offset + 12 + index * 2) / 65_535)
    return { curve: (value) => interpolate(values, value), size: 12 + count * 2 }
  }
  if (type !== 'para') return refuse(`curve tag type ${JSON.stringify(type)}`, 'curv or para')
  const kind = u16(view, offset + 8)
  const counts = [1, 3, 4, 5, 7]
  if (kind > 4) refuse(`parametric curve function ${kind}`, 'functions 0 through 4')
  need(bytes, offset + 12, counts[kind] * 4, 'parametric curve values')
  const parameters = Array.from({ length: counts[kind] }, (_, index) => fixed(view, offset + 12 + index * 4))
  return { curve: (value) => parametric[kind](parameters, value), size: 12 + counts[kind] * 4 }
}

function curvesAt(bytes: Uint8Array, view: DataView, offset: number, count: number): Curve[] {
  const curves: Curve[] = []
  let cursor = offset
  for (let index = 0; index < count; index++) {
    const parsed = parseCurve(bytes, view, cursor)
    curves.push(parsed.curve)
    cursor = align4(cursor + parsed.size)
  }
  return curves
}

const interpolate = (table: number[], value: number): number => {
  const position = clamp(value) * (table.length - 1)
  const low = Math.floor(position)
  return table[low] + (table[Math.min(low + 1, table.length - 1)] - table[low]) * (position - low)
}

function multilinear(grid: number[], points: number[], outputs: number, input: Color): number[] {
  const base = input.map((value, axis) => Math.min(points[axis] - 2, Math.floor(clamp(value) * (points[axis] - 1))))
  const fractions = input.map((value, axis) => clamp(value) * (points[axis] - 1) - base[axis])
  const stride = points.map((_, axis) => points.slice(axis + 1).reduce((a, b) => a * b, outputs))
  const result = Array.from({ length: outputs }, () => 0)
  for (let mask = 0; mask < 2 ** input.length; mask++) {
    let weight = 1
    let start = 0
    for (let axis = 0; axis < input.length; axis++) {
      const high = (mask & (1 << axis)) !== 0
      weight *= high ? fractions[axis] : 1 - fractions[axis]
      start += (base[axis] + Number(high)) * stride[axis]
    }
    for (let channel = 0; channel < outputs; channel++) result[channel] += weight * grid[start + channel]
  }
  return result
}

function tetrahedral4(grid: number[], points: number[], outputs: number, input: Color): number[] {
  const base = input.map((value, axis) => Math.min(points[axis] - 2, Math.floor(clamp(value) * (points[axis] - 1))))
  const fractions = input.map((value, axis) => clamp(value) * (points[axis] - 1) - base[axis])
  const stride = points.map((_, axis) => points.slice(axis + 1).reduce((a, b) => a * b, outputs))
  const order = [1, 2, 3].sort((a, b) => fractions[b] - fractions[a])
  const plane = (first: number) => {
    const corner = [0, 0, 0, 0]
    let at = base.reduce((sum, value, axis) => sum + (value + (axis === 0 ? first : 0)) * stride[axis], 0)
    let previous = grid.slice(at, at + outputs)
    const result = [...previous]
    for (const axis of order) {
      corner[axis] = 1
      at = base.reduce((sum, value, index) => sum + (value + (index === 0 ? first : corner[index])) * stride[index], 0)
      const next = grid.slice(at, at + outputs)
      for (let channel = 0; channel < outputs; channel++) result[channel] += fractions[axis] * (next[channel] - previous[channel])
      previous = next
    }
    return result
  }
  const low = plane(0)
  const high = plane(1)
  return low.map((value, channel) => value + fractions[0] * (high[channel] - value))
}

export function parseMft(bytes: Uint8Array, view: DataView, offset: number, type: 'mft1' | 'mft2'): ColorTable {
  need(bytes, offset, type === 'mft1' ? 48 : 52, type)
  const inputs = bytes[offset + 8]
  const outputs = bytes[offset + 9]
  const pointCount = bytes[offset + 10]
  if (pointCount < 2) refuse(`${type} grid point count ${pointCount}`, 'at least 2')
  const matrix = Array.from({ length: 9 }, (_, index) => fixed(view, offset + 12 + index * 4))
  const inputEntries = type === 'mft1' ? 256 : u16(view, offset + 48)
  const outputEntries = type === 'mft1' ? 256 : u16(view, offset + 50)
  if (inputEntries < 2 || outputEntries < 2) refuse(`${type} table entry counts ${inputEntries}/${outputEntries}`, 'at least 2 entries')
  const width = type === 'mft1' ? 1 : 2
  const values = inputs * inputEntries + pointCount ** inputs * outputs + outputs * outputEntries
  let cursor = offset + (type === 'mft1' ? 48 : 52)
  need(bytes, cursor, values * width, `${type} tables`)
  const read = () => {
    const value = width === 1 ? bytes[cursor] / 255 : u16(view, cursor) / 65_535
    cursor += width
    return value
  }
  const inputTables = Array.from({ length: inputs }, () => Array.from({ length: inputEntries }, read))
  const grid = Array.from({ length: pointCount ** inputs * outputs }, read)
  const outputTables = Array.from({ length: outputs }, () => Array.from({ length: outputEntries }, read))
  return {
    inputChannels: inputs,
    outputChannels: outputs,
    encoding: type,
    run: (values) => {
      let current = values.map((value, channel) => interpolate(inputTables[channel], value))
      if (inputs === 3) current = matrix3(matrix, current)
      const points = Array.from({ length: inputs }, () => pointCount)
      current = inputs === 3 ? multilinear(grid, points, outputs, current) : tetrahedral4(grid, points, outputs, current)
      return current.map((value, channel) => interpolate(outputTables[channel], value))
    },
  }
}

export function parseMab(bytes: Uint8Array, view: DataView, offset: number, type: 'mAB ' | typeof REVERSE_LUT): ColorTable {
  need(bytes, offset, 32, type)
  const inputs = bytes[offset + 8]
  const outputs = bytes[offset + 9]
  const relative = (at: number) => {
    const value = u32(view, offset + at)
    return value === 0 ? 0 : offset + value
  }
  const bOffset = relative(12),
    matrixOffset = relative(16),
    mOffset = relative(20),
    clutOffset = relative(24),
    aOffset = relative(28)
  const bCurves = bOffset ? curvesAt(bytes, view, bOffset, type === 'mAB ' ? outputs : inputs) : []
  const mCurves = mOffset ? curvesAt(bytes, view, mOffset, type === 'mAB ' ? outputs : inputs) : []
  const aCurves = aOffset ? curvesAt(bytes, view, aOffset, type === 'mAB ' ? inputs : outputs) : []
  if (matrixOffset) need(bytes, matrixOffset, 48, `${type} matrix`)
  const matrix = matrixOffset ? Array.from({ length: 12 }, (_, index) => fixed(view, matrixOffset + index * 4)) : []
  if (clutOffset) need(bytes, clutOffset, 20, `${type} CLUT`)
  const points = clutOffset ? Array.from(bytes.subarray(clutOffset, clutOffset + inputs)) : []
  const precision = clutOffset ? bytes[clutOffset + 16] : 0
  if (clutOffset && precision !== 1 && precision !== 2) refuse(`${type} CLUT precision ${precision}`, '1 or 2 bytes')
  let cursor = clutOffset + 20
  const count = clutOffset ? points.reduce((a, b) => a * b, outputs) : 0
  if (clutOffset) need(bytes, cursor, count * precision, `${type} CLUT values`)
  const grid = Array.from({ length: count }, () => {
    const value = precision === 1 ? bytes[cursor] / 255 : u16(view, cursor) / 65_535
    cursor += precision
    return value
  })
  const apply = (curves: Curve[], values: Color) => (curves.length ? values.map((value, index) => curves[index](value)) : [...values])
  const applyMatrix = (values: Color) =>
    matrix.length
      ? [0, 1, 2].map((row) => matrix[row * 3] * values[0] + matrix[row * 3 + 1] * values[1] + matrix[row * 3 + 2] * values[2] + matrix[9 + row])
      : [...values]
  return {
    inputChannels: inputs,
    outputChannels: outputs,
    encoding: type,
    run: (values) => {
      if (type === 'mAB ') {
        let result = apply(aCurves, values)
        if (grid.length) result = inputs === 3 ? multilinear(grid, points, outputs, result) : tetrahedral4(grid, points, outputs, result)
        return apply(bCurves, applyMatrix(apply(mCurves, result)))
      }
      let result = applyMatrix(apply(bCurves, values))
      result = apply(mCurves, result)
      if (grid.length) result = inputs === 3 ? multilinear(grid, points, outputs, result) : tetrahedral4(grid, points, outputs, result)
      return apply(aCurves, result)
    },
  }
}

export function matrixTables(
  bytes: Uint8Array,
  view: DataView,
  records: Record<string, { offset: number; type: string }>,
): { a2b: ColorTable; b2a: ColorTable } | undefined {
  if (!['rXYZ', 'gXYZ', 'bXYZ', 'rTRC', 'gTRC', 'bTRC'].every((name) => records[name])) return undefined
  for (const name of ['rXYZ', 'gXYZ', 'bXYZ']) if (records[name].type !== 'XYZ ') refuse(`${name} tag type ${records[name].type}`, 'XYZ ')
  const columns = ['rXYZ', 'gXYZ', 'bXYZ'].map((name) => [
    fixed(view, records[name].offset + 8),
    fixed(view, records[name].offset + 12),
    fixed(view, records[name].offset + 16),
  ])
  const curves = ['rTRC', 'gTRC', 'bTRC'].map((name) => parseCurve(bytes, view, records[name].offset).curve)
  const matrix = columns.flatMap((_, row) => columns.map((column) => column[row]))
  const inverse = invert3(matrix)
  const invertCurve = (curve: Curve, target: number) => {
    let low = 0,
      high = 1
    for (let index = 0; index < 24; index++) {
      const middle = (low + high) / 2
      if (curve(middle) < target) low = middle
      else high = middle
    }
    return (low + high) / 2
  }
  return {
    a2b: {
      inputChannels: 3,
      outputChannels: 3,
      encoding: 'mAB ',
      run: (input) =>
        matrix3(
          matrix,
          input.map((value, index) => curves[index](value)),
        ),
    },
    b2a: {
      inputChannels: 3,
      outputChannels: 3,
      encoding: REVERSE_LUT,
      run: (input) => matrix3(inverse, input).map((value, index) => invertCurve(curves[index], value)),
    },
  }
}
