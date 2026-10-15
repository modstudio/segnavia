import { expect, test } from 'bun:test'
import { decodePDFRawStream, PDFArray, type PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { rewritePressPdf } from '../press/adapter.ts'
import { rewriteEffectsPdf } from './adapter.ts'

async function minimalMask(options: { graphicsState?: Record<string, unknown>; nested?: boolean; transfer?: 'invert' } = {}): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const image = document.context.register(
    document.context.stream(Uint8Array.of(0, 64, 128, 255), {
      Type: 'XObject',
      Subtype: 'Image',
      Width: 2,
      Height: 2,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
    }),
  )
  const nestedMask = document.context.register(document.context.obj({ S: 'Alpha', G: document.context.stream('', { BBox: [0, 0, 1, 1] }) }))
  const form = document.context.register(
    document.context.stream('q 2 0 0 -2 10 22 cm /Coverage Do Q', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [10, 20, 12, 22],
      Group: { Type: 'Group', S: 'Transparency', CS: 'DeviceGray', I: true },
      Resources: {
        XObject: { Coverage: image },
        ...(options.nested ? { ExtGState: { Nested: { SMask: nestedMask } } } : {}),
      },
    }),
  )
  const transfer = options.transfer === 'invert' ? document.context.stream('{1 exch sub}', { FunctionType: 4, Domain: [0, 1], Range: [0, 1] }) : undefined
  const mask = document.context.register(document.context.obj({ Type: 'Mask', S: 'Luminosity', G: form, ...(transfer ? { TR: transfer } : {}) }))
  const page = document.addPage([30, 30])
  page.node.set(PDFName.of('Resources'), document.context.obj({ ExtGState: { Mask: { ...options.graphicsState, SMask: mask }, None: { SMask: 'None' } } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('1 0 0 rg /Mask gs 10 20 2 2 re f /None gs')))
  return document.save()
}

function pageContent(document: PDFDocument): string {
  const contents = document.getPage(0).node.Contents()
  const objects = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return objects
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
}

test('rewrites a grayscale-image luminosity mask as a direct image soft mask', async () => {
  const rewritten = await rewriteEffectsPdf(await minimalMask())
  expect(rewritten.report).toEqual({ rule1: 1, ruleC: 0, kept: 0 })
  const output = await PDFDocument.load(rewritten.bytes)
  expect(pageContent(output)).toContain('/SegnaviaEffect1 Do')
  expect(pageContent(output)).not.toContain('/Mask gs')
  const images = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')
  const effect = images.find((image) => image.dict.has(PDFName.of('SegnaviaGeneratedEffect')))
  expect(effect?.dict.has(PDFName.of('SMask'))).toBe(true)
  expect(effect?.dict.get(PDFName.of('ColorSpace'))?.toString()).toContain('/Indexed /DeviceRGB')
})

test('keeps nested masks in Chromium form', async () => {
  const input = await minimalMask({ nested: true })
  const rewritten = await rewriteEffectsPdf(input)
  expect(rewritten.report.rule1).toBe(0)
  expect(rewritten.report.kept).toBe(2)
  expect(rewritten.bytes).toBe(input)
  expect(pageContent(await PDFDocument.load(rewritten.bytes))).toContain('/Mask gs')
})

test.each([
  ['non-default fill alpha', { graphicsState: { ca: 0.6667 } }],
  ['blend mode', { graphicsState: { BM: 'Multiply' } }],
  ['non-identity transfer', { transfer: 'invert' as const }],
])('keeps a Rule 1 mask with %s', async (_label, options) => {
  const input = await minimalMask(options)
  const rewritten = await rewriteEffectsPdf(input)
  expect(rewritten.report).toEqual({ rule1: 0, ruleC: 0, kept: 1 })
  expect(rewritten.bytes).toBe(input)
})

async function minimalOneAxisComposite(
  options: { functionShape?: 'cycle' | 'deep'; innerAlpha?: number | string; matrix?: number[]; secondAxis?: boolean } = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  const type2 = (from: number[], to: number[]) => document.context.obj({ FunctionType: 2, Domain: [0, 1], C0: from, C1: to, N: 1 })
  const unsafeFunction = (fallback: PDFDict): PDFDict => {
    if (options.functionShape === 'cycle') {
      const cyclic = document.context.obj({ FunctionType: 3, Domain: [0, 1], Bounds: [], Encode: [0, 1] })
      const reference = document.context.register(cyclic)
      cyclic.set(PDFName.of('Functions'), document.context.obj([reference]))
      return cyclic
    }
    if (options.functionShape === 'deep') {
      let nested = fallback
      for (let depth = 0; depth < 14; depth++)
        nested = document.context.obj({ FunctionType: 3, Domain: [0, 1], Functions: [nested], Bounds: [], Encode: [0, 1] })
      return nested
    }
    return fallback
  }
  const pattern = (gray: boolean, horizontal = false, unsafe = false) =>
    document.context.obj({
      Type: 'Pattern',
      PatternType: 2,
      Matrix: [1, 0, 0, 1, 0, 0],
      Shading: {
        ShadingType: 2,
        ColorSpace: 'DeviceRGB',
        Coords: horizontal ? [0, 0, 10, 0] : [0, 0, 0, 10],
        Extend: [true, true],
        Function: unsafe ? unsafeFunction(type2([1, 0, 0], [0, 0, 1])) : gray ? type2([0, 0, 0], [1, 1, 1]) : type2([1, 0, 0], [0, 0, 1]),
      },
    })
  const maskSource = document.context.register(
    document.context.stream('/Pattern cs /Fade scn 0 0 10 10 re f', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: { Pattern: { Fade: pattern(true, options.secondAxis) } },
    }),
  )
  const luminosity = document.context.register(document.context.obj({ S: 'Luminosity', G: maskSource }))
  const alphaSource = document.context.register(
    document.context.stream('/Lum gs /Pattern cs /Solid scn 0 0 10 10 re f', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: { ExtGState: { Lum: { ca: options.innerAlpha ?? 1, SMask: luminosity } }, Pattern: { Solid: pattern(false) } },
    }),
  )
  const alpha = document.context.register(document.context.obj({ S: 'Alpha', G: alphaSource }))
  const color = document.context.register(
    document.context.stream('/Pattern cs /Color scn 0 0 10 10 re f', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: { Pattern: { Color: pattern(false, false, true) } },
    }),
  )
  const composite = document.context.register(
    document.context.stream('/Alpha gs /Color Do', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      ...(options.matrix ? { Matrix: options.matrix } : {}),
      Resources: { ExtGState: { Alpha: { SMask: alpha } }, XObject: { Color: color } },
    }),
  )
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ ExtGState: { Opacity: { ca: 0.55 } }, XObject: { Composite: composite } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Opacity gs /Composite Do')))
  return document.save()
}

test('rewrites a nested one-axis shading composite as an interpolated image pair', async () => {
  const rewritten = await rewriteEffectsPdf(await minimalOneAxisComposite())
  expect(rewritten.report).toEqual({ rule1: 0, ruleC: 1, kept: 0 })
  const output = await PDFDocument.load(rewritten.bytes)
  expect(pageContent(output)).toContain('/SegnaviaEffect1 Do')
  const images = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')
  const effect = images.find((image) => image.dict.has(PDFName.of('SegnaviaGeneratedEffect')))
  expect(effect?.dict.get(PDFName.of('Width'))?.toString()).toBe('1')
  expect(effect?.dict.has(PDFName.of('SMask'))).toBe(true)
  expect(effect?.dict.get(PDFName.of('Interpolate'))?.toString()).toBe('true')
})

test('keeps a nested composite whose color and coverage axes differ', async () => {
  const input = await minimalOneAxisComposite({ secondAxis: true })
  const rewritten = await rewriteEffectsPdf(input)
  expect(rewritten.report.ruleC).toBe(0)
  expect(rewritten.report.kept).toBe(2)
  expect(rewritten.bytes).toBe(input)
})

test('keeps a nested one-axis composite with a non-identity form Matrix', async () => {
  const input = await minimalOneAxisComposite({ matrix: [1, 0, 0, 1, 5, 5] })
  const rewritten = await rewriteEffectsPdf(input)
  expect(rewritten.report).toEqual({ rule1: 0, ruleC: 0, kept: 2 })
  expect(rewritten.bytes).toBe(input)
})

test('multiplies nested constant alpha into Rule C coverage', async () => {
  const rewritten = await rewriteEffectsPdf(await minimalOneAxisComposite({ innerAlpha: 0.25 }))
  const output = await PDFDocument.load(rewritten.bytes)
  const effect = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('SegnaviaGeneratedEffect')))
  const mask = effect ? output.context.lookup(effect.dict.get(PDFName.of('SMask'))) : undefined
  const samples = mask instanceof PDFRawStream ? decodePDFRawStream(mask).decode() : new Uint8Array()
  expect(Math.max(...samples)).toBeLessThanOrEqual(36)
  expect(Math.max(...samples)).toBeGreaterThanOrEqual(34)
})

test('keeps Rule C when nested constant alpha is not a finite number', async () => {
  const input = await minimalOneAxisComposite({ innerAlpha: 'invalid' })
  const rewritten = await rewriteEffectsPdf(input)
  expect(rewritten.report.ruleC).toBe(0)
  expect(rewritten.bytes).toBe(input)
})

test.each(['cycle', 'deep'] as const)('keeps a Rule C composite with a %s Type 3 function', async (functionShape) => {
  const input = await minimalOneAxisComposite({ functionShape })
  const rewritten = await rewriteEffectsPdf(input)
  expect(rewritten.report.ruleC).toBe(0)
  expect(rewritten.bytes).toBe(input)
})

test('press converts a generated one-axis effect image without reporting it as authored RGB', async () => {
  const effects = await rewriteEffectsPdf(await minimalOneAxisComposite())
  const converted = await rewritePressPdf(effects.bytes, buildPressProfile('mft1'))
  expect(converted.report.images).toEqual([])
  const output = await PDFDocument.load(converted.bytes)
  const generated = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('SegnaviaGeneratedEffect')))
  expect(generated?.dict.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceCMYK')
  expect(generated ? decodePDFRawStream(generated).decode().length : 0).toBe(84)
})
