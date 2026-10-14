import { expect, test } from 'bun:test'
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, rgb } from 'pdf-lib'
import { buildPressProfile } from '../color/profile-fixture.test-helper.ts'
import { inspectPressPdf, rewritePressPdf } from './adapter.ts'

const profile = buildPressProfile('mft1')

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

test('rewrites page fills and strokes and installs the press output intent', async () => {
  const input = await PDFDocument.create()
  const page = input.addPage([100, 100])
  page.drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: rgb(1, 0, 0), borderColor: rgb(0, 0, 0), borderWidth: 2 })
  const converted = await rewritePressPdf(await input.save(), profile)
  expect(converted.report.fills).toBeGreaterThan(0)
  expect(converted.report.strokes).toBeGreaterThan(0)
  expect(converted.report.images).toEqual([])
  const text = await contentText(converted.bytes)
  expect(text).toContain(' k')
  expect(text).toContain(' K')
  expect(text).not.toMatch(/\brg\b|\bRG\b/)
  const output = await PDFDocument.load(converted.bytes)
  const intents = output.catalog.lookup(PDFName.of('OutputIntents'), PDFArray)
  const intent = intents.lookup(0, PDFDict)
  expect(intent.get(PDFName.of('S'))?.toString()).toBe('/GTS_PDFX')
  expect(intent.get(PDFName.of('OutputConditionIdentifier'))?.toString()).toBe('(Custom)')
})

test('the read-back inspection refuses an RGB operator', async () => {
  const document = await PDFDocument.create()
  const page = document.addPage([10, 10])
  page.node.set(PDFName.of('Contents'), document.context.register(document.context.flateStream('1 0 0 rg')))
  await expect(inspectPressPdf(await document.save())).rejects.toThrow(/RGB color operator/)
})

