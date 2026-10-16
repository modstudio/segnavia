import { deflateSync } from 'node:zlib'
import { PDFArray, type PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRef } from 'pdf-lib'
import type { Color, Color3, Color4 } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { applyAffine, IDENTITY_MATRIX, invertAffine, multiplyAffine } from './affine.ts'
import { evaluateCalculator, parseCalculator, staticOperatorCount } from './calculator.ts'
import type { PatternPaint } from './pattern-bounds.ts'
import { arrayNumbers, type ContentBudget, decodeContent, MAX_DOCUMENT_CONTENT_BYTES, rawStreamOf } from './pdf-objects.ts'

// One sample per 0.5 pt maps a 10 CSS-px repeating stripe (7.5 pt) to 15 samples, so the stripe stays a hard press color rather than a blend. The grid is sized from the painted box, not Chromium's oversized Domain.
export const SHADING_SAMPLE_SPACING_PT = 0.5
// 8-bit CMYK at this count is 4 MiB, under MAX_DOCUMENT_CONTENT_BYTES; a 512 pt square still gets 0.5 pt samples.
export const MAX_SHADING_SAMPLES = 1_048_576
// The fidelity suite's four-gradient page is four Type 1 shadings; this admits four at MAX_SHADING_SAMPLES so that page still converts when painted bounds fall back to the full Domain, and refuses a larger document.
export const MAX_DOCUMENT_SHADING_SAMPLES = 4 * MAX_SHADING_SAMPLES
// Chromium's rainbow conic program has 52 operators. Eight max-size grids of that program are charged as samples times the program's operator count. The fidelity four-gradient page and a page of eight 260 by 160 conics sit below it.
export const MAX_DOCUMENT_CALCULATOR_OPERATIONS = 8 * MAX_SHADING_SAMPLES * 52
// Chromium stop programs reuse a handful of RGB triples; 4096 cached 8-bit keys bound the Map so a conic cannot grow it with the grid.
export const MAX_SAMPLING_COLOR_CACHE = 4096
const SAMPLE_CHANNELS = 4
const SAMPLE_BYTES = 1
export const SHADING_BITS_PER_SAMPLE = 8

function refuse(found: string, supported: string): never {
  throw new RenderRefusedError(`The PDF has unsupported ${found}; supported: ${supported}.`)
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function requireFinite(values: readonly number[], found: string): void {
  if (values.some((value) => !Number.isFinite(value))) refuse(found, 'finite numbers')
}

function shadingNumbers(dictionary: PDFDict, key: 'Domain' | 'Matrix', count: 4 | 6): number[] {
  const expected = count === 4 ? 'four finite numbers' : 'six finite numbers'
  const array = dictionary.lookupMaybe(PDFName.of(key), PDFArray)
  if (!array || array.size() !== count) refuse(`shading ${key}`, expected)
  const values = Array.from({ length: count }, (_, index) => array.lookupMaybe(index, PDFNumber)?.asNumber())
  if (values.some((value) => value === undefined || !Number.isFinite(value))) refuse(`shading ${key}`, expected)
  return values as number[]
}

export function shadingDomainOf(shading: PDFDict): number[] {
  return shadingNumbers(shading, 'Domain', 4)
}

function axisSamples(span: number, columnA: number, columnB: number): number {
  if (![span, columnA, columnB].every(Number.isFinite)) refuse('shading axis length', 'a finite length')
  const extent = (Math.hypot(columnA, columnB) * Math.abs(span)) / SHADING_SAMPLE_SPACING_PT
  if (!Number.isFinite(extent)) refuse('shading axis length', 'a finite length')
  return Math.min(MAX_SHADING_SAMPLES, Math.max(1, Math.ceil(extent)))
}

export function packedRgb8(rgb: Color3): number {
  return (Math.round(clamp01(rgb[0]) * 255) << 16) | (Math.round(clamp01(rgb[1]) * 255) << 8) | Math.round(clamp01(rgb[2]) * 255)
}

export function unpackRgb8(key: number): Color3 {
  return [(key >> 16) / 255, ((key >> 8) & 255) / 255, (key & 255) / 255]
}

export function createSamplingColorConverter(convert: (rgb: Color3) => Color): { convert: (rgb: Color3) => Color; size: () => number } {
  const cache = new Map<number, Color>()
  return {
    size: () => cache.size,
    convert: (rgb) => {
      const key = packedRgb8(rgb)
      const cached = cache.get(key)
      if (cached) return cached
      const converted = convert(unpackRgb8(key))
      if (cache.size < MAX_SAMPLING_COLOR_CACHE) cache.set(key, converted)
      return converted
    },
  }
}

export function sampleDomainForPainted(domain: readonly number[], matrix: readonly number[], painted: PatternPaint | undefined): number[] {
  const original = [domain[0] ?? 0, domain[1] ?? 0, domain[2] ?? 0, domain[3] ?? 0]
  // When painted bounds cannot be established (Do while a pattern is selected, a missing paint, a singular matrix), sample Chromium's Domain under MAX_SHADING_SAMPLES.
  if (!painted || painted === 'unbounded') return original
  const inverse = invertAffine(matrix)
  if (!inverse) return original
  const corners = [
    applyAffine(inverse, painted.x0, painted.y0),
    applyAffine(inverse, painted.x1, painted.y0),
    applyAffine(inverse, painted.x0, painted.y1),
    applyAffine(inverse, painted.x1, painted.y1),
  ]
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  const x0 = Math.max(original[0] ?? 0, Math.min(...xs))
  const x1 = Math.min(original[1] ?? 0, Math.max(...xs))
  const y0 = Math.max(original[2] ?? 0, Math.min(...ys))
  const y1 = Math.min(original[3] ?? 0, Math.max(...ys))
  if (!(x0 < x1) || !(y0 < y1)) return original
  return [x0, x1, y0, y1]
}

export function unionSampleDomain(left: readonly number[], right: readonly number[]): number[] {
  return [
    Math.min(left[0] ?? 0, right[0] ?? 0),
    Math.max(left[1] ?? 0, right[1] ?? 0),
    Math.min(left[2] ?? 0, right[2] ?? 0),
    Math.max(left[3] ?? 0, right[3] ?? 0),
  ]
}

export function sampleDomainForUses(domain: readonly number[], uses: Array<{ matrix: readonly number[]; painted: PatternPaint | undefined }>): number[] {
  const original = [domain[0] ?? 0, domain[1] ?? 0, domain[2] ?? 0, domain[3] ?? 0]
  if (uses.length === 0) return original
  let union: number[] | undefined
  for (const use of uses) {
    const next = sampleDomainForPainted(domain, use.matrix, use.painted)
    if (!use.painted || use.painted === 'unbounded') return original
    union = union ? unionSampleDomain(union, next) : next
  }
  return union ?? original
}

export function matrixOf(dictionary: PDFDict | undefined): number[] {
  if (!dictionary?.has(PDFName.of('Matrix'))) return IDENTITY_MATRIX.slice()
  return arrayNumbers(dictionary, 'Matrix', 6)
}

export function shadingDeviceMatrix(shading: PDFDict, pattern: PDFDict | undefined): number[] {
  const shadingMatrix = shading.has(PDFName.of('Matrix')) ? shadingNumbers(shading, 'Matrix', 6) : IDENTITY_MATRIX.slice()
  return pattern ? multiplyAffine(matrixOf(pattern), shadingMatrix) : shadingMatrix
}

function capSampleGrid(n: number, m: number): { n: number; m: number } {
  if (n * m <= MAX_SHADING_SAMPLES) return { n, m }
  const scale = Math.sqrt(MAX_SHADING_SAMPLES / (n * m))
  let nextN = Math.max(1, Math.floor(n * scale))
  let nextM = Math.max(1, Math.floor(m * scale))
  while (nextN * nextM > MAX_SHADING_SAMPLES) {
    if (nextN >= nextM && nextN > 1) nextN--
    else if (nextM > 1) nextM--
    else break
  }
  return { n: nextN, m: nextM }
}

export function shadingSampleGrid(domain: readonly number[], matrix: readonly number[]): { n: number; m: number } {
  const x0 = domain[0] ?? 0
  const x1 = domain[1] ?? 0
  const y0 = domain[2] ?? 0
  const y1 = domain[3] ?? 0
  requireFinite([x0, x1, y0, y1], 'shading Domain')
  const columnAx = matrix[0] ?? 1
  const columnAy = matrix[1] ?? 0
  const columnBx = matrix[2] ?? 0
  const columnBy = matrix[3] ?? 1
  requireFinite([columnAx, columnAy, columnBx, columnBy, matrix[4] ?? 0, matrix[5] ?? 0], 'shading Matrix')
  return capSampleGrid(axisSamples(x1 - x0, columnAx, columnAy), axisSamples(y1 - y0, columnBx, columnBy))
}

export function shadingSampleGridForUses(domain: readonly number[], matrices: readonly (readonly number[])[]): { n: number; m: number } {
  if (matrices.length === 0) return shadingSampleGrid(domain, IDENTITY_MATRIX)
  let n = 1
  let m = 1
  for (const matrix of matrices) {
    const grid = shadingSampleGrid(domain, matrix)
    n = Math.max(n, grid.n)
    m = Math.max(m, grid.m)
  }
  return capSampleGrid(n, m)
}

export function domainValue(min: number, max: number, index: number, size: number): number {
  if (size <= 1) return min
  return min + ((max - min) * index) / (size - 1)
}

export function readSampleCmyk(samples: Uint8Array, n: number, i: number, j: number): Color4 {
  const offset = (j * n + i) * SAMPLE_CHANNELS * SAMPLE_BYTES
  return [(samples[offset] ?? 0) / 255, (samples[offset + 1] ?? 0) / 255, (samples[offset + 2] ?? 0) / 255, (samples[offset + 3] ?? 0) / 255]
}

export function sampleShadingToCmyk(
  program: ReturnType<typeof parseCalculator>,
  domain: readonly number[],
  size: { n: number; m: number },
  convert: (rgb: Color3) => Color4,
): Uint8Array {
  return sampleShading(program, domain, size, convert, 4)
}

export function sampleShading(
  program: ReturnType<typeof parseCalculator>,
  domain: readonly number[],
  size: { n: number; m: number },
  convert: (rgb: Color3) => Color,
  channels: 1 | 4,
): Uint8Array {
  const x0 = domain[0] ?? 0
  const x1 = domain[1] ?? 0
  const y0 = domain[2] ?? 0
  const y1 = domain[3] ?? 0
  const samples = new Uint8Array(size.n * size.m * channels * SAMPLE_BYTES)
  const toCmyk = createSamplingColorConverter(convert).convert
  let offset = 0
  for (let j = 0; j < size.m; j++) {
    const y = domainValue(y0, y1, j, size.m)
    for (let i = 0; i < size.n; i++) {
      const x = domainValue(x0, x1, i, size.n)
      const rgb = evaluateCalculator(program, [x, y])
      if (rgb.length !== 3) refuse('shading function outputs', '3 numbers')
      const cmyk = toCmyk([clamp01(rgb[0] ?? 0), clamp01(rgb[1] ?? 0), clamp01(rgb[2] ?? 0)])
      for (const channel of cmyk) {
        samples[offset] = Math.round(clamp01(channel) * 255)
        offset += SAMPLE_BYTES
      }
    }
  }
  return samples
}

export function chargeShadingSamples(budget: ContentBudget, samples: number, operations: number, channels: 1 | 4 = 4): void {
  const bytes = samples * channels * SAMPLE_BYTES
  if (!Number.isFinite(samples) || samples < 0 || !Number.isFinite(bytes) || bytes < 0)
    refuse(`document shading samples ${samples}`, 'a finite non-negative sample count and byte charge')
  if (!Number.isFinite(operations) || operations < 0) refuse(`document calculator operations ${operations}`, 'a finite non-negative operator count')
  const totalSamples = (budget.shadingSamples ?? 0) + samples
  const totalBytes = budget.decodedBytes + bytes
  const totalOperations = (budget.calculatorOperations ?? 0) + operations
  if (!Number.isFinite(totalSamples) || totalSamples > MAX_DOCUMENT_SHADING_SAMPLES)
    refuse(`document shading samples ${totalSamples}`, `at most ${MAX_DOCUMENT_SHADING_SAMPLES} samples`)
  if (!Number.isFinite(totalOperations) || totalOperations > MAX_DOCUMENT_CALCULATOR_OPERATIONS)
    refuse(`document calculator operations ${totalOperations}`, `at most ${MAX_DOCUMENT_CALCULATOR_OPERATIONS} operators`)
  if (!Number.isFinite(totalBytes) || totalBytes > MAX_DOCUMENT_CONTENT_BYTES)
    refuse(`total decoded content length ${totalBytes}`, `at most ${MAX_DOCUMENT_CONTENT_BYTES} bytes`)
  budget.shadingSamples = totalSamples
  budget.decodedBytes = totalBytes
  budget.calculatorOperations = totalOperations
}

const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

export function replaceType1Function(
  document: PDFDocument,
  shading: PDFDict,
  pattern: PDFDict | undefined,
  convert: (rgb: Color3) => Color,
  budget: ContentBudget,
  painted?: PatternPaint,
  sampleDomain?: readonly number[],
  sampleSize?: { n: number; m: number },
  channels: 1 | 4 = 4,
): { n: number; m: number } {
  const existing = shading.get(PDFName.of('Function'))
  const stream = rawStreamOf(resolved(document, existing))
  if (!stream) return refuse('shading FunctionType 4 stream', 'a FunctionType 4 stream')
  const shadingDomain = shadingDomainOf(shading)
  const matrix = shadingDeviceMatrix(shading, pattern)
  requireFinite(matrix, 'shading Matrix')
  const domain = sampleDomain ? [...sampleDomain] : sampleDomainForPainted(shadingDomain, matrix, painted)
  const size = sampleSize ?? shadingSampleGrid(domain, matrix)
  const program = parseCalculator(new TextDecoder('latin1').decode(decodeContent(stream, budget)))
  const samples = size.n * size.m
  const operations = samples * staticOperatorCount(program)
  chargeShadingSamples(budget, samples, operations, channels)
  const data = sampleShading(program, domain, size, convert, channels)
  const replacement = document.context.stream(deflateSync(data), {
    FunctionType: 0,
    Domain: domain,
    Range: Array.from({ length: channels }, () => [0, 1]).flat(),
    Size: [size.n, size.m],
    BitsPerSample: SHADING_BITS_PER_SAMPLE,
    Order: 1,
    Filter: 'Fl' + 'ateDecode',
  })
  shading.set(PDFName.of('Function'), document.context.register(replacement))
  return size
}
