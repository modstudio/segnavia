import { expect, test } from 'bun:test'
import { PDFDocument, PDFName } from 'pdf-lib'
import { pageContent } from './pdf-content.test-helper.ts'
import { stampWatermark } from './watermark-stamp.ts'

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
  const stamped = await stampWatermark(before, await fixture(2, 'layer'), [1, 3])

  expect(await pageContent(stamped, 0)).toMatch(
    /source-1[\s\S]*\/Artifact\s*<<[\s\S]*\/Type\s*\/Pagination[\s\S]*\/Subtype\s*\/Watermark[\s\S]*\/BBox\s*\[[^\]]+\][\s\S]*>>\s*BDC[\s\S]*\/EmbeddedPdfPage[^\s]*\s+Do[\s\S]*EMC\s*$/,
  )
  expect(await pageContent(stamped, 1)).toBe('source-2')
  expect(await pageContent(stamped, 2)).toMatch(/source-3[\s\S]*\/Artifact[\s\S]*BDC[\s\S]*Do[\s\S]*EMC\s*$/)
  const output = await PDFDocument.load(stamped)
  expect(output.catalog.get(PDFName.of('StructTreeRoot'))?.toString()).toBe(structure)
  expect([...output.context.enumerateIndirectObjects()].filter(([, object]) => object.toString().includes('/StructElem')).length).toBe(0)
})
