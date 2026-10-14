import { expect, test } from 'bun:test'
import { toPress } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { parseCalculator } from './calculator.ts'
import { pressColor } from './color-policy.ts'
import {
  domainValue,
  MAX_SHADING_SAMPLES,
  multiplyAffine,
  readSampleCmyk,
  sampleShadingToCmyk,
  SHADING_SAMPLE_SPACING_PT,
  shadingSampleGrid,
} from './sample-shading.ts'

const profile = readProfile(buildPressProfile('mft1'))
const convert = (rgb: [number, number, number]) => pressColor(profile, rgb)

const REPEATING_LINEAR = `{pop
dup truncate sub
dup 0 le {1 add} if
dup 0 le {pop .8784 .1882 .1882 0} if
dup dup 0 gt exch 1 le and {
dup .5 le {
0 sub pop .8784 .1882 .1882 
}{
.5 sub pop .1882 .1882 .8784 
} ifelse
0} if
0 gt {.1882 .1882 .8784} if
}`

test('a repeating linear domain sampled at 0.5 pt keeps many samples per stripe', () => {
  const domain = [0, 14.1421356, -7.0710678, 7.0710673]
  const matrix = [10.6066027, 10.6066017, 10.6066017, -10.6066027, 0, 0]
  const { n, m } = shadingSampleGrid(domain, matrix)
  const xDevice = Math.hypot(matrix[0] ?? 0, matrix[1] ?? 0) * (domain[1] ?? 0)
  const samplesPerPeriod = n / ((domain[1] ?? 1) - (domain[0] ?? 0))
  expect(n).toBe(Math.ceil(xDevice / SHADING_SAMPLE_SPACING_PT))
  expect(m).toBeGreaterThan(1)
  expect(samplesPerPeriod).toBeGreaterThan(10)
  expect(n * m).toBeLessThanOrEqual(MAX_SHADING_SAMPLES)
})

test('conic and repeating-radial grids follow the 0.5 pt rule on Chromium matrices', () => {
  expect(shadingSampleGrid([-100, 100, -100, 100], [0, 0.75, 0.75, 0, 75, 75])).toEqual({ n: 300, m: 300 })
  expect(shadingSampleGrid([-5, 5, -5, 5], [15, 0, 0, -15, 75, 75])).toEqual({ n: 300, m: 300 })
})

test('sample grid stores x varying fastest so a swapped n/m layout fails', () => {
  const program = parseCalculator('{ pop 0 0 }')
  const size = { n: 3, m: 2 }
  const samples = sampleShadingToCmyk(program, [0, 1, 0, 1], size, convert)
  const left = readSampleCmyk(samples, size.n, 0, 0)
  const right = readSampleCmyk(samples, size.n, size.n - 1, 0)
  const top = readSampleCmyk(samples, size.n, 0, size.m - 1)
  expect(right[3]).toBeCloseTo(0, 5)
  expect(left[3]).toBeCloseTo(1, 5)
  expect(top[3]).toBeCloseTo(1, 5)
  expect(Math.abs((right[3] ?? 0) - (left[3] ?? 0))).toBeGreaterThan(0.5)
})

test('sampling a neutral uses black ink alone, not the color engine', () => {
  const samples = sampleShadingToCmyk(parseCalculator('{ pop pop 0.4 0.4 0.4 }'), [0, 1, 0, 1], { n: 2, m: 2 }, convert)
  const color = readSampleCmyk(samples, 2, 0, 0)
  expect(color).toEqual(pressColor(profile, [0.4, 0.4, 0.4]))
  expect(color.slice(0, 3)).toEqual([0, 0, 0])
  expect(color).not.toEqual(toPress(profile, [0.4, 0.4, 0.4]))
})

test('sampled color at each repeating-linear stop equals pressColor of that stop RGB', () => {
  const program = parseCalculator(REPEATING_LINEAR)
  const size = { n: 5, m: 3 }
  const domain = [0, 1, 0, 1]
  const samples = sampleShadingToCmyk(program, domain, size, convert)
  const stops: Array<[number, [number, number, number]]> = [
    [0.25, [0.8784, 0.1882, 0.1882]],
    [0.5, [0.8784, 0.1882, 0.1882]],
    [0.75, [0.1882, 0.1882, 0.8784]],
    [1, [0.1882, 0.1882, 0.8784]],
  ]
  const errors: number[] = []
  for (const [x, rgb] of stops) {
    const i = Math.round(((x - (domain[0] ?? 0)) / ((domain[1] ?? 1) - (domain[0] ?? 0))) * (size.n - 1))
    const expected = pressColor(profile, rgb)
    const found = readSampleCmyk(samples, size.n, i, 1)
    for (let channel = 0; channel < 4; channel++) errors.push(Math.abs((found[channel] ?? 0) - (expected[channel] ?? 0)) * 255)
  }
  errors.sort((a, b) => a - b)
  expect(errors[Math.ceil(errors.length * 0.99) - 1]).toBeLessThanOrEqual(1)
  expect(domainValue(0, 1, 1, 5)).toBeCloseTo(0.25, 10)
})

test('pattern matrix maps domain axes into device space', () => {
  expect(multiplyAffine([2, 0, 0, 3, 4, 5], [1, 0, 0, 1, 0, 0])).toEqual([2, 0, 0, 3, 4, 5])
})
