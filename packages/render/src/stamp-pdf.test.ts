import { expect, mock, test } from 'bun:test'
import { degrees, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import type { TabRunner } from './browser-tab.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { stampReceivedPdf } from './stamp-pdf.ts'

const tab = {
  setContent: async () => {},
  evaluate: async () => true,
  pdf: () => layerFixture(),
  on: () => tab,
}
const context = {
  route: async () => {},
  routeWebSocket: async () => {},
  newPage: async () => tab,
  close: async () => {},
}
const browser = {
  newContext: async () => context,
  isConnected: () => true,
  on: () => browser,
  off: () => browser,
  close: async () => {},
}
mock.module('playwright-core', () => ({ chromium: { launch: async () => browser } }))

import { parseStampPdfOptions } from './stamp-pdf-options.ts'

async function receivedFixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  document.catalog.set(PDFName.of('Lang'), PDFString.of('he'))
  document.catalog.set(PDFName.of('Outlines'), document.context.register(document.context.obj({ Type: 'Outlines', Count: 0 })))
  for (const rotation of [90, 270]) {
    const page = document.addPage([200, 300])
    page.setRotation(degrees(rotation))
    page.setTrimBox(20, 30, 160, 240)
    page.node.set(
      PDFName.of('Annots'),
      document.context.obj([{ Type: 'Annot', Subtype: 'Link', Rect: [20, 20, 40, 40], A: { S: 'URI', URI: PDFString.of('https://example.com') } }]),
    )
  }
  return document.save()
}

async function layerFixture(): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  for (let index = 0; index < 2; index += 1) {
    const page = document.addPage([300, 200])
    page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream('q Q')))
  }
  return document.save()
}

test('stamps a rotated received PDF while preserving catalog and annotation facts', async () => {
  let html = ''
  const withTab = (async (setup, body) => {
    html = setup.html
    return body({ evaluate: async () => {}, pdf: layerFixture } as never)
  }) as TabRunner
  const output = await stampReceivedPdf(await receivedFixture(), { watermark: { text: 'טיוטה', lang: 'he' } }, {} as RenderDeadline, withTab)

  expect(html.match(/size:300pt 200pt/g)).toHaveLength(2)
  expect(html).toContain('font-family:sans-serif')
  expect(await pageContent(output, 0)).toMatch(/\/Artifact[\s\S]*\/Subtype\s*\/Watermark[\s\S]*\/BBox[\s\S]*0 1 -1 0 200 0 cm/)
  expect(await pageContent(output, 1)).toMatch(/\/Artifact[\s\S]*0 -1 1 0 0 300 cm/)
  const document = await PDFDocument.load(output)
  expect(document.catalog.get(PDFName.of('Lang'))?.toString()).toBe('(he)')
  expect(document.catalog.get(PDFName.of('Outlines'))).toBeDefined()
  expect(document.getPages().every((page) => page.node.Annots()?.size() === 1)).toBe(true)
})

test('stampPdf options require work and use existing watermark and protection parsing', () => {
  expect(() => parseStampPdfOptions({})).toThrow('needs watermark or protection')
  expect(() => parseStampPdfOptions({ watermark: { text: 'Draft', pages: [0] } })).toThrow('integer physical page numbers of 1 or more')
  expect(() => parseStampPdfOptions({ protection: { openPassword: '' } })).toThrow('needs a non-empty string')
  expect(parseStampPdfOptions({ watermark: { text: 'Draft' }, limits: { input: { bytes: 10 } } })).toMatchObject({
    watermark: { text: 'Draft' },
    limits: { input: { bytes: 10 } },
  })
})

test('renderer stampPdf drives the received watermark path end to end', async () => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    const output = await renderer.stampPdf(await receivedFixture(), { watermark: { text: 'Draft' } })
    expect(await pageContent(output, 0)).toContain('/Artifact')
    expect(await pageContent(output, 1)).toContain('/Artifact')
  } finally {
    await renderer.close()
  }
})

test('renderer stampPdf protects received bytes after validation', async () => {
  const { openRenderer } = await import('./index.ts')
  const renderer = await openRenderer({ executablePath: '/fake/chromium' })
  try {
    const output = await renderer.stampPdf(await receivedFixture(), { protection: { ownerPassword: 'owner-stamp' } })
    expect(new TextDecoder('latin1').decode(output)).toMatch(/\/Encrypt\s+\d+\s+\d+\s+R/)
  } finally {
    await renderer.close()
  }
})
