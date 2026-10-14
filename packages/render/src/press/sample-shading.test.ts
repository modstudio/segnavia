import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { toPress } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { inspectPressPdf, rewritePressPdf } from './adapter.ts'
import { evaluateCalculator, parseCalculator } from './calculator.ts'
import { pressColor } from './color-policy.ts'
import { MAX_DOCUMENT_CONTENT_BYTES } from './pdf-objects.ts'
import {
  createSamplingColorConverter,
  domainValue,
  MAX_DOCUMENT_SHADING_SAMPLES,
  MAX_SAMPLING_COLOR_CACHE,
  MAX_SHADING_SAMPLES,
  packedRgb8,
  readSampleCmyk,
  replaceType1Function,
  SHADING_BITS_PER_SAMPLE,
  SHADING_SAMPLE_SPACING_PT,
  sampleDomainForPainted,
  sampleShadingToCmyk,
  shadingSampleGrid,
  unpackRgb8,
} from './sample-shading.ts'

const profileBytes = buildPressProfile('mft1')
const profile = readProfile(profileBytes)
const convert = (rgb: [number, number, number]) => pressColor(profile, rgb)

function setResources(document: PDFDocument, page: ReturnType<PDFDocument['addPage']>, resources: Record<string, unknown>, content: string): void {
  page.node.set(PDFName.of('Resources'), document.context.obj(resources as never))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
}

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
  const close = (found: number[], expected: number[]) => {
    for (let channel = 0; channel < 4; channel++) expect(found[channel]).toBeCloseTo(expected[channel] ?? 0, 2)
  }
  close(left, pressColor(profile, [0, 0, 0]))
  close(right, pressColor(profile, [1, 0, 0]))
  close(top, pressColor(profile, [0, 0, 0]))
  expect(right[1]).not.toBeCloseTo(left[1] ?? 0, 2)
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

test('painted bounds shrink the sample domain; a missing or unbounded paint keeps the shading domain', () => {
  const domain = [0, 1, 0, 1]
  const matrix = [10, 0, 0, 10, 0, 0]
  expect(sampleDomainForPainted(domain, matrix, { x0: 0, y0: 0, x1: 1, y1: 1 })).toEqual([0, 0.1, 0, 0.1])
  expect(sampleDomainForPainted(domain, matrix, undefined)).toEqual(domain)
  expect(sampleDomainForPainted(domain, matrix, 'unbounded')).toEqual(domain)
})

const CONIC = `{exch atan 360 div
dup 0 le {pop 1 0 0 0} if
dup dup 0 gt exch 1 le and {
dup .5 le {
dup .166666672 le {
0 sub 1 exch 6 mul 0 
}{
dup .33333334 le {
.166666672 sub -6 mul 1 add 1 0 
}{
.33333334 sub 0 exch 1 exch 6.0000005 mul 
} ifelse
} ifelse
}{
dup .66666669 le {
.5 sub 0 exch -5.9999995 mul 1 add 1 
}{
dup .83333331 le {
.66666669 sub 6.0000014 mul 0 1 
}{
.83333331 sub 1 exch 0 exch -5.9999995 mul 1 add 
} ifelse
} ifelse
} ifelse
0} if
0 gt {1 0 0} if
}`

test('a repeating-linear sample at the domain origin equals the program at [0, 0]', () => {
  const program = parseCalculator(REPEATING_LINEAR)
  const samples = sampleShadingToCmyk(program, [0, 1, 0, 1], { n: 3, m: 3 }, convert)
  const rgb = evaluateCalculator(program, [0, 0])
  const expected = pressColor(profile, [rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0])
  const found = readSampleCmyk(samples, 3, 0, 0)
  for (let channel = 0; channel < 4; channel++) expect(found[channel]).toBeCloseTo(expected[channel] ?? 0, 2)
})

test('the conic origin sample is the start color', () => {
  const program = parseCalculator(CONIC)
  const samples = sampleShadingToCmyk(program, [-1, 1, -1, 1], { n: 3, m: 3 }, convert)
  expect(domainValue(-1, 1, 1, 3)).toBe(0)
  const found = readSampleCmyk(samples, 3, 1, 1)
  const expected = pressColor(profile, [1, 0, 0])
  for (let channel = 0; channel < 4; channel++) expect(found[channel]).toBeCloseTo(expected[channel] ?? 0, 2)
})

test('sampling Chromium conic at compass points matches evaluating the program at those domain points', () => {
  const program = parseCalculator(CONIC)
  const domain = [-100, 100, -100, 100]
  const size = { n: 21, m: 21 }
  const samples = sampleShadingToCmyk(program, domain, size, convert)
  const points: Array<[number, number]> = [
    [50, 0],
    [0, 50],
    [-50, 0],
    [0, -50],
    [10, 10],
    [10, -10],
    [-10, 10],
    [-10, -10],
  ]
  for (const [x, y] of points) {
    const i = Math.round(((x - (domain[0] ?? 0)) / ((domain[1] ?? 1) - (domain[0] ?? 0))) * (size.n - 1))
    const j = Math.round(((y - (domain[2] ?? 0)) / ((domain[3] ?? 1) - (domain[2] ?? 0))) * (size.m - 1))
    expect(domainValue(domain[0] ?? 0, domain[1] ?? 0, i, size.n)).toBe(x)
    expect(domainValue(domain[2] ?? 0, domain[3] ?? 0, j, size.m)).toBe(y)
    const rgb = evaluateCalculator(program, [x, y])
    expect(rgb).toHaveLength(3)
    const expected = pressColor(profile, unpackRgb8(packedRgb8([rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0])))
    const found = readSampleCmyk(samples, size.n, i, j)
    for (let channel = 0; channel < 4; channel++) expect(Math.abs((found[channel] ?? 0) - (expected[channel] ?? 0))).toBeLessThanOrEqual(1 / 255 + 1e-12)
  }
})

test('8-bit samples stay within one 8-bit step of the press color', () => {
  const samples = sampleShadingToCmyk(parseCalculator('{ pop pop 0.4 0.2 0.8 }'), [0, 1, 0, 1], { n: 2, m: 2 }, convert)
  const found = readSampleCmyk(samples, 2, 0, 0)
  const expected = pressColor(profile, [0.4, 0.2, 0.8])
  for (let channel = 0; channel < 4; channel++) expect(Math.abs((found[channel] ?? 0) - (expected[channel] ?? 0))).toBeLessThanOrEqual(1 / 255 + 1e-12)
})

test('converts a function-based RGB shading into a DeviceCMYK sampled function', async () => {
  const document = await PDFDocument.create()
  const domain = [0, 1, 0, 1]
  const fn = document.context.register(
    document.context.stream(deflateSync(new TextEncoder().encode('{ pop pop 0.4 0.4 0.4 }')), {
      FunctionType: 4,
      Domain: domain,
      Range: [0, 1, 0, 1, 0, 1],
      Filter: 'Fl' + 'ateDecode',
    }),
  )
  const shading = document.context.register(
    document.context.obj({
      ShadingType: 1,
      ColorSpace: 'DeviceRGB',
      Domain: domain,
      Function: fn,
      Background: [0.4, 0.4, 0.4],
      Extend: [true, true],
      BBox: [0, 0, 1, 1],
    }),
  )
  const pattern = document.context.register(document.context.obj({ Type: 'Pattern', PatternType: 2, Matrix: [10, 0, 0, 10, 0, 0], Shading: shading }))
  setResources(document, document.addPage([20, 20]), { Pattern: { P1: pattern } }, '/Pattern cs /P1 scn')
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  expect(converted.report.sampledShadings).toBe(1)
  const output = await PDFDocument.load(converted.bytes)
  const convertedShading = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFDict => object instanceof PDFDict && object.has(PDFName.of('ShadingType')))
  expect(convertedShading?.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceCMYK')
  expect(convertedShading?.lookup(PDFName.of('Background'), PDFArray).size()).toBe(4)
  expect(convertedShading?.lookup(PDFName.of('Extend'), PDFArray).size()).toBe(2)
  expect(convertedShading?.lookup(PDFName.of('BBox'), PDFArray).size()).toBe(4)
  const sampled = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('BitsPerSample')))
  expect(sampled).toBeDefined()
  expect(sampled?.dict.lookup(PDFName.of('Size'), PDFArray).lookup(0)?.toString()).toBe('20')
  expect(sampled?.dict.lookup(PDFName.of('BitsPerSample'))?.toString()).toBe(String(SHADING_BITS_PER_SAMPLE))
  expect(sampled?.dict.lookup(PDFName.of('Order'))?.toString()).toBe('1')
  expect(sampled?.dict.lookup(PDFName.of('Range'), PDFArray).size()).toBe(8)
  expect(readSampleCmyk(decodePDFRawStream(sampled as PDFRawStream).decode(), 20, 0, 0)).toEqual(pressColor(profile, [0.4, 0.4, 0.4]))
  const leftoverType4 = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.lookup(PDFName.of('FunctionType'))?.toString() === '4')
  expect(leftoverType4).toHaveLength(0)
})

test('a painted fill sizes the sampled function from that box, not the full domain', async () => {
  const document = await PDFDocument.create()
  const domain = [0, 1, 0, 1]
  const fn = document.context.register(
    document.context.stream(deflateSync(new TextEncoder().encode('{ pop pop 0.4 0.4 0.4 }')), {
      FunctionType: 4,
      Domain: domain,
      Range: [0, 1, 0, 1, 0, 1],
      Filter: 'Fl' + 'ateDecode',
    }),
  )
  const shading = document.context.register(
    document.context.obj({
      ShadingType: 1,
      ColorSpace: 'DeviceRGB',
      Domain: domain,
      Function: fn,
    }),
  )
  const pattern = document.context.register(document.context.obj({ Type: 'Pattern', PatternType: 2, Matrix: [10, 0, 0, 10, 0, 0], Shading: shading }))
  setResources(document, document.addPage([20, 20]), { Pattern: { P1: pattern } }, '/Pattern cs /P1 scn 0 0 1 1 re f')
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const output = await PDFDocument.load(converted.bytes)
  const sampled = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('BitsPerSample')))
  expect(sampled?.dict.lookup(PDFName.of('Size'), PDFArray).lookup(0)?.toString()).toBe('2')
  expect(sampled?.dict.lookup(PDFName.of('Size'), PDFArray).lookup(1)?.toString()).toBe('2')
  expect(sampled?.dict.lookup(PDFName.of('Domain'), PDFArray).lookup(1)?.toString()).toBe('0.1')
})

test('the read-back inspection refuses a function-based shading still in RGB', async () => {
  const document = await PDFDocument.create()
  const fn = document.context.register(
    document.context.stream(deflateSync(new TextEncoder().encode('{ pop pop 1 0 0 }')), {
      FunctionType: 4,
      Domain: [0, 1, 0, 1],
      Range: [0, 1, 0, 1, 0, 1],
      Filter: 'Fl' + 'ateDecode',
    }),
  )
  const shading = document.context.register(document.context.obj({ ShadingType: 1, ColorSpace: 'DeviceRGB', Domain: [0, 1, 0, 1], Function: fn }))
  setResources(document, document.addPage([10, 10]), { Shading: { Bad: shading } }, '/Bad sh')
  await expect(inspectPressPdf(await document.save())).rejects.toThrow(/ShadingType 1 FunctionType 4 color space DeviceRGB/)
})

test('sampling converts 8-bit quantized RGB through a cache capped by name', () => {
  const seen: number[][] = []
  const convertSpy = (rgb: [number, number, number]) => {
    seen.push(rgb)
    return pressColor(profile, rgb)
  }
  sampleShadingToCmyk(parseCalculator('{ pop pop 0.3 0.2 0.8 }'), [0, 1, 0, 1], { n: 4, m: 4 }, convertSpy)
  expect(seen.length).toBe(1)
  expect(seen[0]).toEqual(unpackRgb8(packedRgb8([0.3, 0.2, 0.8])))
  const cache = createSamplingColorConverter(convert)
  for (let red = 0; red < 20; red++)
    for (let green = 0; green < 20; green++) for (let blue = 0; blue < 20; blue++) cache.convert([red / 255, green / 255, blue / 255])
  expect(20 * 20 * 20).toBeGreaterThan(MAX_SAMPLING_COLOR_CACHE)
  expect(cache.size()).toBe(MAX_SAMPLING_COLOR_CACHE)
})

test('a shading that would exceed the document sample ceiling is refused by name', async () => {
  const document = await PDFDocument.create()
  const fn = document.context.register(
    document.context.stream(deflateSync(new TextEncoder().encode('{ pop pop 1 0 0 }')), {
      FunctionType: 4,
      Domain: [0, 1, 0, 1],
      Range: [0, 1, 0, 1, 0, 1],
      Filter: 'Fl' + 'ateDecode',
    }),
  )
  const shading = document.context.obj({ ShadingType: 1, ColorSpace: 'DeviceRGB', Domain: [0, 1, 0, 1], Function: fn }) as PDFDict
  expect(() =>
    replaceType1Function(
      document,
      shading,
      undefined,
      convert,
      { decodedBytes: 0, shadingSamples: MAX_DOCUMENT_SHADING_SAMPLES },
      { x0: 0, y0: 0, x1: 1, y1: 1 },
    ),
  ).toThrow(/document shading samples/)
})

test('sample bytes are charged to the content budget before evaluation', async () => {
  const document = await PDFDocument.create()
  const fn = document.context.register(
    document.context.stream(deflateSync(new TextEncoder().encode('{ pop pop 1 0 0 }')), {
      FunctionType: 4,
      Domain: [0, 100, 0, 100],
      Range: [0, 1, 0, 1, 0, 1],
      Filter: 'Fl' + 'ateDecode',
    }),
  )
  const shading = document.context.obj({ ShadingType: 1, ColorSpace: 'DeviceRGB', Domain: [0, 100, 0, 100], Function: fn }) as PDFDict
  let called = 0
  expect(() =>
    replaceType1Function(
      document,
      shading,
      undefined,
      () => {
        called++
        return [0, 0, 0, 1]
      },
      { decodedBytes: MAX_DOCUMENT_CONTENT_BYTES - 1000, shadingSamples: 0 },
    ),
  ).toThrow(/total decoded content length/)
  expect(called).toBe(0)
})

test.each([2, 0])('refuses a type 1 shading whose function is type %p', async (functionType) => {
  const document = await PDFDocument.create()
  const fn =
    functionType === 2
      ? document.context.register(document.context.obj({ FunctionType: 2, C0: [1, 0, 0], C1: [0, 0, 1] }))
      : document.context.register(document.context.stream(Uint8Array.of(0), { FunctionType: functionType }))
  const shading = document.context.register(document.context.obj({ ShadingType: 1, ColorSpace: 'DeviceRGB', Function: fn }))
  setResources(document, document.addPage([10, 10]), { Shading: { Bad: shading } }, '/Bad sh')
  await expect(rewritePressPdf(await document.save(), profileBytes)).rejects.toThrow(`ShadingType 1 FunctionType ${functionType}`)
})
