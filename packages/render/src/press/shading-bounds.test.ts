import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { readProfile } from '../color/profile.ts'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { RenderRefusedError } from '../errors.ts'
import { rewritePressDocument, rewritePressPdf } from './adapter.ts'
import { MAX_CONTENT_BYTES, MAX_DOCUMENT_CONTENT_BYTES, nameOf } from './pdf-objects.ts'
import { shadingSampleGridForUses } from './sample-shading.ts'

const profileBytes = buildPressProfile('mft1')

function type4Function(document: PDFDocument) {
  return document.context.register(
    document.context.stream(deflateSync(new TextEncoder().encode('{ pop pop 0.4 0.4 0.4 }')), {
      FunctionType: 4,
      Domain: [0, 1, 0, 1],
      Range: [0, 1, 0, 1, 0, 1],
      Filter: 'Fl' + 'ateDecode',
    }),
  )
}

function type1Shading(document: PDFDocument, fn: ReturnType<PDFDocument['context']['register']>, extra: Record<string, unknown> = {}) {
  return document.context.register(document.context.obj({ ShadingType: 1, ColorSpace: 'DeviceRGB', Domain: [0, 1, 0, 1], Function: fn, ...extra }))
}

function type2Pattern(document: PDFDocument, shading: ReturnType<PDFDocument['context']['register']>, matrix: number[] = [10, 0, 0, 10, 0, 0]) {
  return document.context.register(document.context.obj({ Type: 'Pattern', PatternType: 2, Matrix: matrix, Shading: shading }))
}

function formXObject(document: PDFDocument, content: string) {
  return document.context.register(document.context.stream(content, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10], Resources: {} }))
}

function type0Streams(document: PDFDocument): PDFRawStream[] {
  return document.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.lookup(PDFName.of('FunctionType'))?.toString() === '0')
}

function domainAndSize(stream: PDFRawStream): { domain: string[]; size: string[] } {
  const domain = stream.dict.lookup(PDFName.of('Domain'), PDFArray)
  const size = stream.dict.lookup(PDFName.of('Size'), PDFArray)
  const numbers = (array: PDFArray) => Array.from({ length: array.size() }, (_, index) => array.lookup(index)?.toString() ?? '')
  return { domain: numbers(domain), size: numbers(size) }
}

test('a split Contents array unions paints across streams', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  const first = document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 1 1 re f'))
  const second = document.context.register(document.context.stream('0 0 10 10 re f'))
  page.node.set(PDFName.of('Contents'), document.context.obj([first, second]))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['20', '20'] })
})

test('two pages sharing a pattern union both painted boxes', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const page1 = document.addPage([20, 20])
  page1.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  page1.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 1 1 re f')))
  const page2 = document.addPage([20, 20])
  page2.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  page2.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 10 10 re f')))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['20', '20'] })
})

test('an appearance painting after a page unions with the page fill', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 1 1 re f')))
  const appearance = document.context.register(
    document.context.stream('/Pattern cs /P1 scn 0 0 10 10 re f', {
      Type: 'XObject',
      Subtype: 'Form',
      BBox: [0, 0, 10, 10],
      Resources: { Pattern: { P1: pattern } },
    }),
  )
  const annotation = document.context.register(document.context.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10], AP: { N: appearance } }))
  page.node.set(PDFName.of('Annots'), document.context.obj([annotation]))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['20', '20'] })
})

test('a shading listed in both /Shading and /Pattern converts from the pattern paint', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Shading: { S1: shading }, Pattern: { P1: pattern } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 10 10 re f')))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['20', '20'] })
})

test('two shadings sharing one FunctionType 4 stream each get a Type 0 covering their own use', async () => {
  const document = await PDFDocument.create()
  const fn = type4Function(document)
  const shading1 = type1Shading(document, fn)
  const shading2 = type1Shading(document, fn)
  const pattern1 = type2Pattern(document, shading1)
  const pattern2 = type2Pattern(document, shading2)
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern1, P2: pattern2 } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 1 1 re f /P2 scn 0 0 10 10 re f')))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const output = await PDFDocument.load(converted.bytes)
  const sampled = type0Streams(output)
  expect(sampled).toHaveLength(2)
  const domains = sampled.map((stream) => domainAndSize(stream).domain.join(' ')).sort()
  expect(domains).toEqual(['0 0.1 0 0.1', '0 1 0 1'])
  const leftoverType4 = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.lookup(PDFName.of('FunctionType'))?.toString() === '4')
  expect(leftoverType4).toHaveLength(1)
})

test('a shared select stream across two pages unions the large fill', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const select = document.context.register(document.context.stream('/Pattern cs /P1 scn'))
  const page1 = document.addPage([20, 20])
  page1.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  page1.node.set(PDFName.of('Contents'), document.context.obj([select, document.context.register(document.context.stream('0 0 1 1 re f'))]))
  const page2 = document.addPage([20, 20])
  page2.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  page2.node.set(PDFName.of('Contents'), document.context.obj([select, document.context.register(document.context.stream('0 0 10 10 re f'))]))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['20', '20'] })
})

test('a Contents array that reselects after rg unions the large fill', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const select = document.context.register(document.context.stream('/Pattern cs /P1 scn'))
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  page.node.set(
    PDFName.of('Contents'),
    document.context.obj([
      select,
      document.context.register(document.context.stream('0 0 1 1 re f')),
      document.context.register(document.context.stream('0 0 0 rg')),
      select,
      document.context.register(document.context.stream('0 0 10 10 re f')),
    ]),
  )
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['20', '20'] })
})

test("a form's rg does not clear the page pattern", async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const form = formXObject(document, '0 0 0 rg')
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  const first = document.context.register(
    document.context.stream('/Pattern cs /P1 scn 0 0 1 1 re f', { Resources: { Pattern: { P1: pattern }, XObject: { Fm: form } } }),
  )
  const second = document.context.register(document.context.stream('0 0 10 10 re f'))
  page.node.set(PDFName.of('Contents'), document.context.obj([first, second]))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['20', '20'] })
})

test("a form fill does not inherit the page's pattern", async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern = type2Pattern(document, shading)
  const form = formXObject(document, '0 0 10 10 re f')
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  const first = document.context.register(
    document.context.stream('/Pattern cs /P1 scn 0 0 1 1 re f', { Resources: { Pattern: { P1: pattern }, XObject: { Fm: form } } }),
  )
  const second = document.context.register(document.context.stream('0 0 1 1 re f'))
  page.node.set(PDFName.of('Contents'), document.context.obj([first, second]))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '0.1', '0', '0.1'], size: ['2', '2'] })
})

test('sample grid takes the largest n and m across uses of the union domain', () => {
  expect(
    shadingSampleGridForUses(
      [0, 1, 0, 1],
      [
        [10, 0, 0, 10, 0, 0],
        [100, 0, 0, 100, 0, 0],
      ],
    ),
  ).toEqual({ n: 200, m: 200 })
})

test('one shading through scale 10 and scale 100 takes the larger sample grid', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document))
  const pattern1 = type2Pattern(document, shading, [10, 0, 0, 10, 0, 0])
  const pattern2 = type2Pattern(document, shading, [100, 0, 0, 100, 0, 0])
  const page = document.addPage([120, 120])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern1, P2: pattern2 } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 10 10 re f /P2 scn 0 0 100 100 re f')))
  const converted = await rewritePressPdf(await document.save(), profileBytes)
  const sampled = type0Streams(await PDFDocument.load(converted.bytes))
  expect(sampled).toHaveLength(1)
  expect(domainAndSize(sampled[0] as PDFRawStream)).toEqual({ domain: ['0', '1', '0', '1'], size: ['200', '200'] })
})

test('the bounds pass refuses over the document content ceiling before conversion', async () => {
  const document = await PDFDocument.create()
  const shadingDict = document.context.obj({
    ShadingType: 1,
    ColorSpace: 'DeviceRGB',
    Domain: [0, 1, 0, 1],
    Function: type4Function(document),
  })
  const shading = document.context.register(shadingDict)
  const pattern = type2Pattern(document, shading)
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Pattern: { P1: pattern } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Pattern cs /P1 scn 0 0 10 10 re f')))
  const payload = new Uint8Array(MAX_CONTENT_BYTES)
  for (let index = 0; index < 4; index++) {
    const extra = document.addPage([20, 20])
    extra.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(payload)))
  }
  expect(MAX_CONTENT_BYTES * 4).toBe(MAX_DOCUMENT_CONTENT_BYTES)
  try {
    rewritePressDocument(document, readProfile(profileBytes))
    throw new Error('expected refuse')
  } catch (error) {
    expect(error).toBeInstanceOf(RenderRefusedError)
    expect((error as Error).message).toMatch(/total decoded content length/)
  }
  expect(nameOf(shadingDict.get(PDFName.of('ColorSpace')))).toBe('DeviceRGB')
})

test('a missing Domain names Domain', async () => {
  const document = await PDFDocument.create()
  const fn = type4Function(document)
  const shading = document.context.register(document.context.obj({ ShadingType: 1, ColorSpace: 'DeviceRGB', Function: fn }))
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Shading: { Bad: shading } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Bad sh')))
  await expect(rewritePressPdf(await document.save(), profileBytes)).rejects.toThrow(/unsupported shading Domain; supported: four finite numbers/)
})

test('a shading Matrix that is not six finite numbers names Matrix', async () => {
  const document = await PDFDocument.create()
  const shading = type1Shading(document, type4Function(document), { Matrix: [1, 0, 0] })
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Resources'), document.context.obj({ Shading: { Bad: shading } }))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('/Bad sh')))
  await expect(rewritePressPdf(await document.save(), profileBytes)).rejects.toThrow(/unsupported shading Matrix; supported: six finite numbers/)
})
