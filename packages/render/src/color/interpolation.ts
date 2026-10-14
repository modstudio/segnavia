import { type Color3, checked, clamp } from './types.ts'

export interface Samples {
  length: number
  get(index: number): number
}

export function interpolate(table: Samples, value: number): number {
  if (table.length === 0) throw new Error('ICC interpolation table is empty')
  const position = clamp(value) * (table.length - 1)
  const low = Math.floor(position)
  const lower = table.get(low)
  return lower + (table.get(Math.min(low + 1, table.length - 1)) - lower) * (position - low)
}

function layout(points: number[], outputs: number, input: readonly number[]) {
  const base = input.map((value, axis) => {
    const count = checked(points, axis, 'CLUT dimensions')
    return Math.min(count - 2, Math.floor(clamp(value) * (count - 1)))
  })
  const fractions = input.map((value, axis) => clamp(value) * (checked(points, axis, 'CLUT dimensions') - 1) - checked(base, axis, 'CLUT base'))
  const stride = points.map((_, axis) => points.slice(axis + 1).reduce((a, b) => a * b, outputs))
  return { base, fractions, stride }
}

export function multilinear(grid: Samples, points: number[], outputs: number, input: readonly number[]): number[] {
  const { base, fractions, stride } = layout(points, outputs, input)
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
    for (let channel = 0; channel < outputs; channel++) result[channel] = checked(result, channel, 'CLUT result') + weight * grid.get(start + channel)
  }
  return result
}

export function tetrahedral4(grid: Samples, points: number[], outputs: number, input: readonly number[]): number[] {
  const { base, fractions, stride } = layout(points, outputs, input)
  const order = [1, 2, 3].sort((a, b) => checked(fractions, b, 'CLUT fractions') - checked(fractions, a, 'CLUT fractions'))
  const plane = (first: number) => {
    const corner = [0, 0, 0, 0]
    let at = base.reduce((sum, value, axis) => sum + (value + (axis === 0 ? first : 0)) * checked(stride, axis, 'CLUT stride'), 0)
    let previous = Array.from({ length: outputs }, (_, channel) => grid.get(at + channel))
    const result = [...previous]
    for (const axis of order) {
      corner[axis] = 1
      at = base.reduce(
        (sum, value, index) => sum + (value + (index === 0 ? first : checked(corner, index, 'CLUT corner'))) * checked(stride, index, 'CLUT stride'),
        0,
      )
      const next = Array.from({ length: outputs }, (_, channel) => grid.get(at + channel))
      for (let channel = 0; channel < outputs; channel++)
        result[channel] =
          checked(result, channel, 'CLUT result') +
          checked(fractions, axis, 'CLUT fractions') * (checked(next, channel, 'CLUT corner') - checked(previous, channel, 'CLUT corner'))
      previous = next
    }
    return result
  }
  const low = plane(0),
    high = plane(1)
  return low.map((value, channel) => value + checked(fractions, 0, 'CLUT fractions') * (checked(high, channel, 'CLUT high plane') - value))
}

export function matrixInput(values: readonly number[]): Color3 {
  return [checked(values, 0, 'matrix input'), checked(values, 1, 'matrix input'), checked(values, 2, 'matrix input')]
}
