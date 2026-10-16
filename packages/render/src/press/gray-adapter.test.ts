import { expect, test } from 'bun:test'
import { deflateSync } from 'node:zlib'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { toGray } from '../color/engine.ts'
import { readProfile } from '../color/profile.ts'
import { buildGrayProfile } from '../color/profile-fixture.test-helper.ts'
import { inspectPressPdf, rewritePressPdf } from './adapter.ts'

const profile = buildGrayProfile('trc-gamma')

function setResources(document: PDFDocument, page: ReturnType<PDFDocument['addPage']>, resources: Record<string, unknown>, content: string): void {
  page.node.set(PDFName.of('Resources'), document.context.obj(resources as never))
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(content)))
}

async function contentText(bytes: Uint8Array): Promise<string> {
  const document = await PDFDocument.load(bytes)
  const contents = document.getPage(0).node.Contents()
  const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : []
  return streams
    .map((object) => document.context.lookup(object))
    .filter((object): object is PDFRawStream => object instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n')
}

function type2(document: PDFDocument, from: number[], to: number[]) {
  return document.context.register(document.context.obj({ FunctionType: 2, Domain: [0, 1], Range: [0, 1, 0, 1, 0, 1], C0: from, C1: to, N: 1 }))
}

test('writes gray operators and a one-channel output intent through a gray profile', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([20, 20])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('0.2 0.4 0.6 rg 0.5 G')))
  const converted = await rewritePressPdf(await document.save(), profile, 255)
  expect(converted.report.destination).toBe('gray')
  expect(converted.report.neutralColors).toBe(0)
  const output = await PDFDocument.load(converted.bytes)
  const text = await contentText(converted.bytes)
  const expected = toGray(readProfile(profile), [0.2, 0.4, 0.6])[0]
  expect(text).toContain(`${Math.round(expected * 1_000_000) / 1_000_000} g`)
  expect(text).toMatch(/\bG\b/)
  expect(text).not.toMatch(/\brg\b|\bRG\b|\bk\b|\bK\b/)
  const intents = output.catalog.lookup(PDFName.of('OutputIntents'), PDFArray)
  const intent = intents.lookup(0, PDFDict)
  const embedded = output.context.lookup(intent.get(PDFName.of('DestOutputProfile'))) as PDFRawStream
  expect(embedded.dict.get(PDFName.of('N'))?.toString()).toBe('1')
  expect((await inspectPressPdf(converted.bytes)).destination).toBe('gray')
})

test('a gray press refuses CMYK content and read-back refuses planted RGB content', async () => {
  const cmyk = await PDFDocument.create()
  cmyk.addPage([10, 10]).node.set(PDFName.of('Contents'), cmyk.context.register(cmyk.context.stream('0 0 0 1 k')))
  await expect(rewritePressPdf(await cmyk.save(), profile)).rejects.toThrow(/k.*greyscale press/)
  const rgb = await PDFDocument.create()
  const page = rgb.addPage([10, 10])
  page.node.set(PDFName.of('Contents'), rgb.context.register(rgb.context.stream('1 0 0 rg')))
  const profileStream = rgb.context.register(rgb.context.stream(profile, { N: 1 }))
  const intent = rgb.context.register(rgb.context.obj({ DestOutputProfile: profileStream }))
  rgb.catalog.set(PDFName.of('OutputIntents'), rgb.context.obj([intent]))
  await expect(inspectPressPdf(await rgb.save())).rejects.toThrow(/RGB color operator/)
})

test('gray shadings, groups, and generated effect images have one output component', async () => {
  const document = await PDFDocument.create()
  const fn = type2(document, [1, 0, 0], [0, 0, 1])
  const shading = document.context.register(
    document.context.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Background: [0.2, 0.4, 0.6], Coords: [0, 0, 10, 0], Function: fn }),
  )
  const effect = (contents: Uint8Array, extra: Record<string, unknown>) =>
    document.context.register(
      document.context.stream(contents, {
        Type: 'XObject',
        Subtype: 'Image',
        Width: contents.length / 3,
        Height: 1,
        ColorSpace: 'DeviceRGB',
        BitsPerComponent: 8,
        SegnaviaGeneratedEffect: true,
        ...extra,
      }),
    )
  const ruleC = effect(Uint8Array.of(255, 0, 0, 0, 0, 255), {})
  const rule1 = effect(Uint8Array.of(0, 0, 0), { SegnaviaEffectColor: [0.2, 0.4, 0.6] })
  const group = document.context.register(
    document.context.stream('', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 1, 1], Resources: {}, Group: { S: 'Transparency', CS: 'DeviceRGB' } }),
  )
  setResources(document, document.addPage([20, 20]), { Shading: { S: shading }, XObject: { C: ruleC, I: rule1, G: group } }, '/S sh /C Do /I Do /G Do')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report).toMatchObject({ destination: 'gray', gradientStops: 2, groups: 1 })
  const output = await PDFDocument.load(converted.bytes)
  const objects = output.context.enumerateIndirectObjects().map(([, object]) => object)
  const foundShading = objects.find((object): object is PDFDict => object instanceof PDFDict && object.has(PDFName.of('ShadingType')))
  expect(foundShading?.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceGray')
  expect(foundShading?.lookup(PDFName.of('Background'), PDFArray).size()).toBe(1)
  const images = objects.filter((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('SegnaviaGeneratedEffect')))
  expect(images[0]?.dict.get(PDFName.of('ColorSpace'))?.toString()).toBe('/DeviceGray')
  expect(images[1]?.dict.get(PDFName.of('ColorSpace'))?.toString()).toContain('/Indexed /DeviceGray 0')
  expect(decodePDFRawStream(images[0] as PDFRawStream).decode()).toHaveLength(2)
})

test('a Type 1 shading becomes a one-channel sampled function', async () => {
  const document = await PDFDocument.create()
  const domain = [0, 1, 0, 1]
  const fn = document.context.register(
    document.context.stream(deflateSync(new TextEncoder().encode('{ pop pop 0.2 0.4 0.6 }')), {
      FunctionType: 4,
      Domain: domain,
      Range: [0, 1, 0, 1, 0, 1],
      Filter: 'Fl' + 'ateDecode',
    }),
  )
  const shading = document.context.register(document.context.obj({ ShadingType: 1, ColorSpace: 'DeviceRGB', Domain: domain, Function: fn }))
  const pattern = document.context.register(document.context.obj({ Type: 'Pattern', PatternType: 2, Matrix: [10, 0, 0, 10, 0, 0], Shading: shading }))
  setResources(document, document.addPage([20, 20]), { Pattern: { P1: pattern } }, '/Pattern cs /P1 scn')
  const converted = await rewritePressPdf(await document.save(), profile)
  expect(converted.report.sampledShadings).toBe(1)
  const output = await PDFDocument.load(converted.bytes)
  const sampled = output.context
    .enumerateIndirectObjects()
    .map(([, object]) => object)
    .find((object): object is PDFRawStream => object instanceof PDFRawStream && object.dict.has(PDFName.of('BitsPerSample')))
  expect(sampled?.dict.lookup(PDFName.of('Range'), PDFArray).size()).toBe(2)
  expect(sampled ? decodePDFRawStream(sampled).decode().length : 0).toBe(400)
})

test('gray mask sources use PDF luminosity without changing alpha opacity data', async () => {
  const document = await PDFDocument.create()
  const form = (content: string) =>
    document.context.register(
      document.context.stream(content, {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, 10, 10],
        Resources: {},
        Group: { S: 'Transparency', CS: 'DeviceRGB' },
      }),
    )
  const luminositySource = form('0.2 0.4 0.6 rg')
  const alphaSource = form('0 0 0 rg')
  const transfer = document.context.register(document.context.stream(Uint8Array.of(9, 8, 7), { FunctionType: 4 }))
  const luminosityMask = document.context.register(document.context.obj({ S: 'Luminosity', G: luminositySource }))
  const alphaMask = document.context.register(document.context.obj({ S: 'Alpha', G: alphaSource, TR: transfer }))
  setResources(document, document.addPage([20, 20]), { ExtGState: { Lum: { SMask: luminosityMask }, Alpha: { SMask: alphaMask } } }, '/Lum gs /Alpha gs')
  const converted = await rewritePressPdf(await document.save(), profile)
  const output = await PDFDocument.load(converted.bytes)
  const lum = output.context.lookup(luminositySource) as PDFRawStream
  const alpha = output.context.lookup(alphaSource) as PDFRawStream
  expect(new TextDecoder().decode(decodePDFRawStream(lum).decode())).toContain('0.362 g')
  expect(lum.dict.lookup(PDFName.of('Group'), PDFDict).get(PDFName.of('CS'))?.toString()).toBe('/DeviceGray')
  expect(new TextDecoder().decode(decodePDFRawStream(alpha).decode())).toContain('0 g')
  expect(alpha.dict.lookup(PDFName.of('Group'), PDFDict).get(PDFName.of('CS'))?.toString()).toBe('/DeviceGray')
  const outputMask = output.context.lookup(alphaMask, PDFDict)
  const outputTransfer = output.context.lookup(outputMask.get(PDFName.of('TR'))) as PDFRawStream
  expect(outputTransfer.contents).toEqual(Uint8Array.of(9, 8, 7))
})
