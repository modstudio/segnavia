import { deflateSync } from 'node:zlib'
import { type PDFDict, type PDFDocument, PDFName, type PDFObject, PDFRef } from 'pdf-lib'
import type { Color3, Color4 } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { applyAffine, IDENTITY_MATRIX, invertAffine, multiplyAffine } from './affine.ts'
import { evaluateCalculator, parseCalculator } from './calculator.ts'
import type { PatternPaint } from './pattern-bounds.ts'
import { arrayNumbers, type ContentBudget, decodeContent, MAX_DOCUMENT_CONTENT_BYTES, rawStreamOf } from './pdf-objects.ts'

// One sample per 0.5 pt maps a 10 CSS-px repeating stripe (7.5 pt) to 15 samples, so the stripe stays a hard press color rather than a blend. The grid is sized from the painted box, not Chromium's oversized Domain.
export const SHADING_SAMPLE_SPACING_PT = 0.5
// 8-bit CMYK at this count is 4 MiB, under MAX_DOCUMENT_CONTENT_BYTES; a 512 pt square still gets 0.5 pt samples.
export const MAX_SHADING_SAMPLES = 1_048_576
// The fidelity suite's four-gradient page is four Type 1 shadings; this admits four at MAX_SHADING_SAMPLES so that page still converts when painted bounds fall back to the full Domain, and refuses a larger document.
export const MAX_DOCUMENT_SHADING_SAMPLES = 4 * MAX_SHADING_SAMPLES
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

function axisSamples(span: number, columnA: number, columnB: number): number {
  return Math.max(1, Math.ceil((Math.hypot(columnA, columnB) * Math.abs(span)) / SHADING_SAMPLE_SPACING_PT))
}

export function packedRgb8(rgb: Color3): number {
  return (Math.round(clamp01(rgb[0]) * 255) << 16) | (Math.round(clamp01(rgb[1]) * 255) << 8) | Math.round(clamp01(rgb[2]) * 255)
}

export function unpackRgb8(key: number): Color3 {
  return [(key >> 16) / 255, ((key >> 8) & 255) / 255, (key & 255) / 255]
}

export function createSamplingColorConverter(convert: (rgb: Color3) => Color4): { convert: (rgb: Color3) => Color4; size: () => number } {
  const cache = new Map<number, Color4>()
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
  // A use this tracker cannot bound (Do while a pattern is selected, a missing fill, a singular matrix) keeps Chromium's Domain under MAX_SHADING_SAMPLES.
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

export function matrixOf(dictionary: PDFDict | undefined): number[] {
  if (!dictionary?.has(PDFName.of('Matrix'))) return IDENTITY_MATRIX.slice()
  return arrayNumbers(dictionary, 'Matrix', 6)
}

export function shadingDeviceMatrix(shading: PDFDict, pattern: PDFDict | undefined): number[] {
  const shadingMatrix = matrixOf(shading)
  return pattern ? multiplyAffine(matrixOf(pattern), shadingMatrix) : shadingMatrix
}

export function shadingSampleGrid(domain: readonly number[], matrix: readonly number[]): { n: number; m: number } {
  const x0 = domain[0] ?? 0
  const x1 = domain[1] ?? 0
  const y0 = domain[2] ?? 0
  const y1 = domain[3] ?? 0
  let n = axisSamples(x1 - x0, matrix[0] ?? 1, matrix[1] ?? 0)
  let m = axisSamples(y1 - y0, matrix[2] ?? 0, matrix[3] ?? 1)
  if (n * m <= MAX_SHADING_SAMPLES) return { n, m }
  const scale = Math.sqrt(MAX_SHADING_SAMPLES / (n * m))
  n = Math.max(1, Math.floor(n * scale))
  m = Math.max(1, Math.floor(m * scale))
  while (n * m > MAX_SHADING_SAMPLES) {
    if (n >= m && n > 1) n--
    else if (m > 1) m--
    else break
  }
  return { n, m }
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
  const x0 = domain[0] ?? 0
  const x1 = domain[1] ?? 0
  const y0 = domain[2] ?? 0
  const y1 = domain[3] ?? 0
  const samples = new Uint8Array(size.n * size.m * SAMPLE_CHANNELS * SAMPLE_BYTES)
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

function chargeSamples(budget: ContentBudget, samples: number): void {
  const bytes = samples * SAMPLE_CHANNELS * SAMPLE_BYTES
  const totalSamples = (budget.shadingSamples ?? 0) + samples
  if (totalSamples > MAX_DOCUMENT_SHADING_SAMPLES) refuse(`document shading samples ${totalSamples}`, `at most ${MAX_DOCUMENT_SHADING_SAMPLES} samples`)
  budget.shadingSamples = totalSamples
  budget.decodedBytes += bytes
  if (budget.decodedBytes > MAX_DOCUMENT_CONTENT_BYTES)
    refuse(`total decoded content length ${budget.decodedBytes}`, `at most ${MAX_DOCUMENT_CONTENT_BYTES} bytes`)
}

const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

export function replaceType1Function(
  document: PDFDocument,
  shading: PDFDict,
  pattern: PDFDict | undefined,
  convert: (rgb: Color3) => Color4,
  budget: ContentBudget,
  painted?: PatternPaint,
): { n: number; m: number } {
  const existing = shading.get(PDFName.of('Function'))
  const stream = rawStreamOf(resolved(document, existing))
  if (!stream) return refuse('shading FunctionType 4 stream', 'a FunctionType 4 stream')
  const program = parseCalculator(new TextDecoder('latin1').decode(decodeContent(stream, budget)))
  const shadingDomain = arrayNumbers(shading, 'Domain', 4)
  const matrix = shadingDeviceMatrix(shading, pattern)
  const domain = sampleDomainForPainted(shadingDomain, matrix, painted)
  const size = shadingSampleGrid(domain, matrix)
  chargeSamples(budget, size.n * size.m)
  const samples = sampleShadingToCmyk(program, domain, size, convert)
  const replacement = document.context.stream(deflateSync(samples), {
    FunctionType: 0,
    Domain: domain,
    Range: [0, 1, 0, 1, 0, 1, 0, 1],
    Size: [size.n, size.m],
    BitsPerSample: SHADING_BITS_PER_SAMPLE,
    Order: 1,
    Filter: 'Fl' + 'ateDecode',
  })
  if (existing instanceof PDFRef) document.context.assign(existing, replacement)
  else shading.set(PDFName.of('Function'), document.context.register(replacement))
  return size
}
