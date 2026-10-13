import { invert3, matrix3 } from './spaces.ts'
import { type ColorTable, type Curve, checked, clamp, color3, type Matrix3, REVERSE_LUT, refuse } from './types.ts'

export const signature = (bytes: Uint8Array, offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4))
export const u16 = (view: DataView, offset: number): number => view.getUint16(offset, false)
export const u32 = (view: DataView, offset: number): number => view.getUint32(offset, false)
export const fixed = (view: DataView, offset: number): number => view.getInt32(offset, false) / 65_536
const align4 = (value: number) => (value + 3) & ~3

function need(bytes: Uint8Array, offset: number, length: number, structure: string): void {
  if (offset < 0 || length < 0 || offset + length > bytes.length) refuse(`truncated ${structure}`, `${structure} contained within the profile`)
}

const parametric: Array<(p: number[], x: number) => number> = [
  (p, x) => clamp(x) ** checked(p, 0, 'parametric curve'),
  (p, x) => {
    const [g, a, b] = color3(p, 'parametric curve')
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
  const parameterCount = checked(counts, kind, 'parametric curve function')
  need(bytes, offset + 12, parameterCount * 4, 'parametric curve values')
  const parameters = Array.from({ length: parameterCount }, (_, index) => fixed(view, offset + 12 + index * 4))
  const evaluate = checked(parametric, kind, 'parametric curve function')
  return { curve: (value) => evaluate(parameters, value), size: 12 + parameterCount * 4 }
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
  if (table.length === 0) throw new Error('ICC interpolation table is empty')
  const position = clamp(value) * (table.length - 1)
  const low = Math.floor(position)
  const lower = checked(table, low, 'interpolation table')
  return lower + (checked(table, Math.min(low + 1, table.length - 1), 'interpolation table') - lower) * (position - low)
}

function multilinear(grid: number[], points: number[], outputs: number, input: readonly number[]): number[] {
  const base = input.map((value, axis) => {
    const count = checked(points, axis, 'CLUT dimensions')
    return Math.min(count - 2, Math.floor(clamp(value) * (count - 1)))
  })
  const fractions = input.map((value, axis) => clamp(value) * (checked(points, axis, 'CLUT dimensions') - 1) - checked(base, axis, 'CLUT base'))
  const stride = points.map((_, axis) => points.slice(axis + 1).reduce((a, b) => a * b, outputs))
  const result = Array.from({ length: outputs }, () => 0)
  for (let mask = 0; mask < 2 ** input.length; mask++) {
    let weight = 1
    let start = 0
    for (let axis = 0; axis < input.length; axis++) {
      const high = (mask & (1 << axis)) !== 0
      const fraction = checked(fractions, axis, 'CLUT fractions')
      weight *= high ? fraction : 1 - fraction
      start += (checked(base, axis, 'CLUT base') + Number(high)) * checked(stride, axis, 'CLUT stride')
    }
    for (let channel = 0; channel < outputs; channel++)
      result[channel] = checked(result, channel, 'CLUT result') + weight * checked(grid, start + channel, 'CLUT grid')
  }
  return result
}

function tetrahedral4(grid: number[], points: number[], outputs: number, input: readonly number[]): number[] {
  const base = input.map((value, axis) => {
    const count = checked(points, axis, 'CLUT dimensions')
    return Math.min(count - 2, Math.floor(clamp(value) * (count - 1)))
  })
  const fractions = input.map((value, axis) => clamp(value) * (checked(points, axis, 'CLUT dimensions') - 1) - checked(base, axis, 'CLUT base'))
  const stride = points.map((_, axis) => points.slice(axis + 1).reduce((a, b) => a * b, outputs))
  const order = [1, 2, 3].sort((a, b) => checked(fractions, b, 'CLUT fractions') - checked(fractions, a, 'CLUT fractions'))
  const plane = (first: number) => {
    const corner = [0, 0, 0, 0]
    let at = base.reduce((sum, value, axis) => sum + (value + (axis === 0 ? first : 0)) * checked(stride, axis, 'CLUT stride'), 0)
    let previous = grid.slice(at, at + outputs)
    const result = [...previous]
    for (const axis of order) {
      corner[axis] = 1
      at = base.reduce(
        (sum, value, index) => sum + (value + (index === 0 ? first : checked(corner, index, 'CLUT corner'))) * checked(stride, index, 'CLUT stride'),
        0,
      )
      const next = grid.slice(at, at + outputs)
      for (let channel = 0; channel < outputs; channel++)
        result[channel] =
          checked(result, channel, 'CLUT result') +
          checked(fractions, axis, 'CLUT fractions') * (checked(next, channel, 'CLUT corner') - checked(previous, channel, 'CLUT corner'))
      previous = next
    }
    return result
  }
  const low = plane(0)
  const high = plane(1)
  return low.map((value, channel) => value + checked(fractions, 0, 'CLUT fractions') * (checked(high, channel, 'CLUT high plane') - value))
}

export function parseMft(bytes: Uint8Array, view: DataView, offset: number, type: 'mft1' | 'mft2'): ColorTable {
  need(bytes, offset, type === 'mft1' ? 48 : 52, type)
  const inputs = checked(bytes, offset + 8, `${type} header`)
  const outputs = checked(bytes, offset + 9, `${type} header`)
  const pointCount = checked(bytes, offset + 10, `${type} header`)
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
    const value = width === 1 ? checked(bytes, cursor, `${type} table`) / 255 : u16(view, cursor) / 65_535
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
        current = matrix3(fixedMatrix, color3(current, `${type} input`))
      }
      const points = Array.from({ length: inputs }, () => pointCount)
      current = inputs === 3 ? multilinear(grid, points, outputs, current) : tetrahedral4(grid, points, outputs, current)
      return current.map((value, channel) => interpolate(checked(outputTables, channel, `${type} output tables`), value))
    },
  }
}

export function parseMab(bytes: Uint8Array, view: DataView, offset: number, type: 'mAB ' | typeof REVERSE_LUT): ColorTable {
  need(bytes, offset, 32, type)
  const inputs = checked(bytes, offset + 8, `${type} header`)
  const outputs = checked(bytes, offset + 9, `${type} header`)
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
  const precision = clutOffset ? checked(bytes, clutOffset + 16, `${type} CLUT`) : 0
  if (clutOffset && precision !== 1 && precision !== 2) refuse(`${type} CLUT precision ${precision}`, '1 or 2 bytes')
  let cursor = clutOffset + 20
  const count = clutOffset ? points.reduce((a, b) => a * b, outputs) : 0
  if (clutOffset) need(bytes, cursor, count * precision, `${type} CLUT values`)
  const grid = Array.from({ length: count }, () => {
    const value = precision === 1 ? checked(bytes, cursor, `${type} CLUT values`) / 255 : u16(view, cursor) / 65_535
    cursor += precision
    return value
  })
  const apply = (curves: Curve[], values: readonly number[]) =>
    curves.length ? values.map((value, index) => checked(curves, index, `${type} curves`)(value)) : [...values]
  const applyMatrix = (values: readonly number[]) => {
    if (!matrix.length) return [...values]
    const [x, y, z] = color3(values, `${type} matrix input`)
    return [
      checked(matrix, 0, `${type} matrix`) * x +
        checked(matrix, 1, `${type} matrix`) * y +
        checked(matrix, 2, `${type} matrix`) * z +
        checked(matrix, 9, `${type} matrix`),
      checked(matrix, 3, `${type} matrix`) * x +
        checked(matrix, 4, `${type} matrix`) * y +
        checked(matrix, 5, `${type} matrix`) * z +
        checked(matrix, 10, `${type} matrix`),
      checked(matrix, 6, `${type} matrix`) * x +
        checked(matrix, 7, `${type} matrix`) * y +
        checked(matrix, 8, `${type} matrix`) * z +
        checked(matrix, 11, `${type} matrix`),
    ]
  }
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
  for (const name of ['rXYZ', 'gXYZ', 'bXYZ']) {
    const record = records[name]
    if (!record) refuse(`missing ${name} tag`, name)
    if (record.type !== 'XYZ ') refuse(`${name} tag type ${record.type}`, 'XYZ ')
  }
  const columns = ['rXYZ', 'gXYZ', 'bXYZ'].map((name) => [
    fixed(view, checkedRecord(records, name).offset + 8),
    fixed(view, checkedRecord(records, name).offset + 12),
    fixed(view, checkedRecord(records, name).offset + 16),
  ])
  const curves = ['rTRC', 'gTRC', 'bTRC'].map((name) => parseCurve(bytes, view, checkedRecord(records, name).offset).curve)
  const matrix: Matrix3 = [
    checked(checked(columns, 0, 'colorant columns'), 0, 'red colorant'),
    checked(checked(columns, 1, 'colorant columns'), 0, 'green colorant'),
    checked(checked(columns, 2, 'colorant columns'), 0, 'blue colorant'),
    checked(checked(columns, 0, 'colorant columns'), 1, 'red colorant'),
    checked(checked(columns, 1, 'colorant columns'), 1, 'green colorant'),
    checked(checked(columns, 2, 'colorant columns'), 1, 'blue colorant'),
    checked(checked(columns, 0, 'colorant columns'), 2, 'red colorant'),
    checked(checked(columns, 1, 'colorant columns'), 2, 'green colorant'),
    checked(checked(columns, 2, 'colorant columns'), 2, 'blue colorant'),
  ]
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
          color3(
            input.map((value, index) => checked(curves, index, 'RGB curves')(value)),
            'RGB curve result',
          ),
        ),
    },
    b2a: {
      inputChannels: 3,
      outputChannels: 3,
      encoding: REVERSE_LUT,
      run: (input) => matrix3(inverse, color3(input, 'RGB PCS input')).map((value, index) => invertCurve(checked(curves, index, 'RGB curves'), value)),
    },
  }
}

function checkedRecord(records: Record<string, { offset: number; type: string }>, name: string): { offset: number; type: string } {
  const record = records[name]
  if (!record) throw new Error(`ICC profile is missing ${name} after its tag set was validated`)
  return record
}
