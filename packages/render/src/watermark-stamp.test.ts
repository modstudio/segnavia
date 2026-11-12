import { expect, test } from 'bun:test'
import { StyleSheet } from '@segnavia/format'
import { PDFDocument, PDFName } from 'pdf-lib'
import type { TabRunner } from './browser-tab.ts'
import { RenderRefusedError } from './errors.ts'
import { pageContent } from './pdf-content.test-helper.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { applyWatermark, stampWatermark, watermarkCopyStamper } from './watermark-stamp.ts'

async function fixture(pages: number, prefix: string): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  for (let index = 0; index < pages; index += 1) {
    const page = document.addPage([200, 300])
    page.pushOperators()
    page.node.set(PDFName.of('Contents'), document.context.register(document.context.stream(`${prefix}-${index + 1}`)))
  }
  return document.save()
}

test('stamps selected pages as pagination watermark artifacts and leaves structure alone', async () => {
  const source = await PDFDocument.load(await fixture(3, 'source'))
  source.catalog.set(PDFName.of('StructTreeRoot'), source.context.obj({ Type: 'StructTreeRoot', K: [] }))
  const before = await source.save()
  const structure = source.catalog.get(PDFName.of('StructTreeRoot'))?.toString()
  const stamped = await stampWatermark(before, await fixture(2, 'layer'), [
    { layerPage: 0, outputPage: 1 },
    { layerPage: 1, outputPage: 3 },
  ])

  expect(await pageContent(stamped, 0)).toMatch(
    /source-1[\s\S]*\/Artifact\s*<<[\s\S]*\/Type\s*\/Pagination[\s\S]*\/Subtype\s*\/Watermark[\s\S]*\/BBox\s*\[[^\]]+\][\s\S]*>>\s*BDC[\s\S]*\/EmbeddedPdfPage[^\s]*\s+Do[\s\S]*EMC\s*$/,
  )
  expect(await pageContent(stamped, 1)).toBe('source-2')
  expect(await pageContent(stamped, 2)).toMatch(/source-3[\s\S]*\/Artifact[\s\S]*BDC[\s\S]*Do[\s\S]*EMC\s*$/)
  const output = await PDFDocument.load(stamped)
  expect(output.catalog.get(PDFName.of('StructTreeRoot'))?.toString()).toBe(structure)
  expect([...output.context.enumerateIndirectObjects()].filter(([, object]) => object.toString().includes('/StructElem')).length).toBe(0)
})

test('keeps physical page selection across pagesPdf slot-fill copies', async () => {
  const page = { html: '<p>Reader</p>', size: { width: 100, height: 100 }, scripts: 'refuse' as const, dir: 'ltr' as const }
  const withTab = (async (_setup, body) => body({ evaluate: async () => {}, pdf: async () => fixture(1, 'layer') } as never)) as TabRunner
  let firstCount = 0
  const first = await applyWatermark(
    [{ bytes: await fixture(2, 'first'), page }],
    { watermark: { text: 'Draft', pages: [3] } },
    '',
    {} as RenderDeadline,
    withTab,
    {
      reportPageCount: (count) => {
        firstCount = count
      },
      validateSelection: false,
    },
  )
  let secondCount = 0
  const second = await applyWatermark(
    [{ bytes: await fixture(2, 'second'), page }],
    { watermark: { text: 'Draft', pages: [3] } },
    '',
    {} as RenderDeadline,
    withTab,
    {
      physicalPageOffset: firstCount,
      reportPageCount: (count) => {
        secondCount = count
      },
      validateSelection: false,
    },
  )
  expect(firstCount + secondCount).toBe(4)
  expect(await pageContent(first[0] as Uint8Array, 0)).toBe('first-1')
  expect(await pageContent(first[0] as Uint8Array, 1)).toBe('first-2')
  expect(await pageContent(second[0] as Uint8Array, 0)).toMatch(/second-1[\s\S]*\/Artifact/)
  expect(await pageContent(second[0] as Uint8Array, 1)).toBe('second-2')
})

test('validates watermark selection against every laid-out slot-fill copy', async () => {
  const page = { html: '<p>Reader</p>', size: { width: 100, height: 100 }, scripts: 'refuse' as const, dir: 'ltr' as const }
  const withTab = (async (_setup, body) => body({ evaluate: async () => {}, pdf: async () => fixture(1, 'layer') } as never)) as TabRunner
  const stamper = watermarkCopyStamper({ watermark: { text: 'Draft', pages: [3] } }, '', {} as RenderDeadline, withTab)

  await stamper.stamp([{ bytes: await fixture(2, 'first'), page }])
  expect(() => stamper.validate()).toThrow(
    new RenderRefusedError('The watermark selects physical page 3, but the laid-out output has 2 pages; select a page from 1 through 2 to clear this refusal.'),
  )

  await stamper.stamp([{ bytes: await fixture(2, 'second'), page }])
  expect(() => stamper.validate()).not.toThrow()
})

test('the layer carries page font facts but none of the document CSS', async () => {
  const page = {
    html: '<p>Reader</p>',
    size: { width: 100, height: 100 },
    scripts: 'refuse' as const,
    style: StyleSheet.parse({ css: 'body{background:#fff}.reader{font-family:Page Sans}' }),
  }
  let html = ''
  const withTab = (async (setup, body) => {
    html = setup.html
    return body({ evaluate: async () => {}, pdf: async () => fixture(1, 'layer') } as never)
  }) as TabRunner
  await applyWatermark(
    [{ bytes: await fixture(1, 'reader'), page, fontFamily: 'Page Sans', fontFaceCss: '@font-face{font-family:"Page Sans";src:local(Arial)}' }],
    { watermark: { text: 'Draft' }, css: 'section{break-after:avoid}' },
    '',
    {} as RenderDeadline,
    withTab,
  )
  expect(html).toContain('font-family:Page Sans')
  expect(html).toContain('@font-face{font-family:"Page Sans";src:local(Arial)}')
  expect(html).not.toContain('body{background:#fff}')
  expect(html).not.toContain('section{break-after:avoid}')
})
