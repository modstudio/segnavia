import { deflateSync } from 'node:zlib'
import { PDFDict, type PDFDocument, PDFName, type PDFObject, PDFRef } from 'pdf-lib'
import type { Color3, Color4 } from '../color/types.ts'
import { RenderRefusedError } from '../errors.ts'
import { evaluateCalculator, parseCalculator } from './calculator.ts'
import { arrayNumbers, type ContentBudget, decodeContent, MAX_DOCUMENT_CONTENT_BYTES, rawStreamOf } from './pdf-objects.ts'

// One sample per 0.5 pt maps a 10 CSS-px repeating stripe (7.5 pt) to 15 samples, so the stripe stays a hard press color rather than a blend.
export const SHADING_SAMPLE_SPACING_PT = 0.5
// 16-bit CMYK at this count is 8 MiB, under MAX_DOCUMENT_CONTENT_BYTES; a 512 pt square still gets 0.5 pt samples.
export const MAX_SHADING_SAMPLES = 1_048_576
export const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0]
const SAMPLE_CHANNELS = 4
const SAMPLE_BYTES = 2

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

export function multiplyAffine(left: readonly number[], right: readonly number[]): number[] {
  const [a0, b0, c0, d0, e0, f0] = left
  const [a1, b1, c1, d1, e1, f1] = right
  return [
    (a0 ?? 0) * (a1 ?? 0) + (c0 ?? 0) * (b1 ?? 0),
    (b0 ?? 0) * (a1 ?? 0) + (d0 ?? 0) * (b1 ?? 0),
    (a0 ?? 0) * (c1 ?? 0) + (c0 ?? 0) * (d1 ?? 0),
    (b0 ?? 0) * (c1 ?? 0) + (d0 ?? 0) * (d1 ?? 0),
    (a0 ?? 0) * (e1 ?? 0) + (c0 ?? 0) * (f1 ?? 0) + (e0 ?? 0),
    (b0 ?? 0) * (e1 ?? 0) + (d0 ?? 0) * (f1 ?? 0) + (f0 ?? 0),
  ]
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
  const view = new DataView(samples.buffer, samples.byteOffset, samples.byteLength)
  return [
    view.getUint16(offset, false) / 65535,
    view.getUint16(offset + 2, false) / 65535,
    view.getUint16(offset + 4, false) / 65535,
    view.getUint16(offset + 6, false) / 65535,
  ]
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
  const view = new DataView(samples.buffer, samples.byteOffset, samples.byteLength)
  let offset = 0
  for (let j = 0; j < size.m; j++) {
    const y = domainValue(y0, y1, j, size.m)
    for (let i = 0; i < size.n; i++) {
      const rgb = evaluateCalculator(program, [domainValue(x0, x1, i, size.n), y])
      if (rgb.length !== 3) refuse('shading function outputs', '3 numbers')
      const cmyk = convert([clamp01(rgb[0] ?? 0), clamp01(rgb[1] ?? 0), clamp01(rgb[2] ?? 0)])
      for (const channel of cmyk) {
        view.setUint16(offset, Math.round(clamp01(channel) * 65535), false)
        offset += SAMPLE_BYTES
      }
    }
  }
  return samples
}

function chargeSamples(budget: ContentBudget | undefined, bytes: number): void {
  if (!budget) return
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
): { n: number; m: number } {
  const stream = rawStreamOf(resolved(document, shading.get(PDFName.of('Function'))))
  if (!stream) return refuse('shading FunctionType 4 stream', 'a FunctionType 4 stream')
  const program = parseCalculator(new TextDecoder('latin1').decode(decodeContent(stream, budget)))
  const domain = arrayNumbers(shading, 'Domain', 4)
  const matrix = shadingDeviceMatrix(shading, pattern)
  const size = shadingSampleGrid(domain, matrix)
  const samples = sampleShadingToCmyk(program, domain, size, convert)
  chargeSamples(budget, samples.byteLength)
  const replacement = document.context.stream(deflateSync(samples), {
    FunctionType: 0,
    Domain: domain,
    Range: [0, 1, 0, 1, 0, 1, 0, 1],
    Size: [size.n, size.m],
    BitsPerSample: 16,
    Order: 1,
    Filter: 'Fl' + 'ateDecode',
  })
  shading.set(PDFName.of('Function'), document.context.register(replacement))
  return size
}
