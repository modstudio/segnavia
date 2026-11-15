import { describe, expect, test } from 'bun:test'
import { PDFDocument, PDFName } from 'pdf-lib'
import { sourcePdfMediaPage } from './placed-pdf-source.ts'

async function page() {
  const document = await PDFDocument.create()
  return { document, page: document.addPage([100, 50]) }
}

describe('sourcePdfMediaPage', () => {
  test('inherits a crop box from the parent Pages node', async () => {
    const { document, page: leaf } = await page()
    document.catalog.Pages().set(PDFName.of('CropBox'), document.context.obj([10, 5, 60, 40]))
    expect(sourcePdfMediaPage(leaf, 1).boxes.crop).toEqual({ x: 10, y: 5, width: 50, height: 35 })
  })

  test('never inherits a trim box', async () => {
    const { document, page: leaf } = await page()
    document.catalog.Pages().set(PDFName.of('TrimBox'), document.context.obj([10, 5, 60, 40]))
    expect(sourcePdfMediaPage(leaf, 1).boxes.trim).toBeUndefined()
  })

  test('reads a box from any two opposite corners', async () => {
    const { document, page: leaf } = await page()
    leaf.node.set(PDFName.of('BleedBox'), document.context.obj([60, 40, 10, 5]))
    expect(sourcePdfMediaPage(leaf, 1).boxes.bleed).toEqual({ x: 10, y: 5, width: 50, height: 35 })
  })

  test('treats a malformed optional box as absent', async () => {
    const { document, page: leaf } = await page()
    leaf.node.set(PDFName.of('ArtBox'), document.context.obj([0, 0, 10]))
    leaf.node.set(PDFName.of('TrimBox'), document.context.obj([5, 5, 5, 40]))
    const boxes = sourcePdfMediaPage(leaf, 1).boxes
    expect(boxes.art).toBeUndefined()
    expect(boxes.trim).toBeUndefined()
  })

  test('refuses a page with no usable MediaBox, naming the page', async () => {
    const { document, page: leaf } = await page()
    leaf.node.set(PDFName.of('MediaBox'), document.context.obj(['a', 0, 1, 1]))
    expect(() => sourcePdfMediaPage(leaf, 3)).toThrow('page 3 has no usable MediaBox')
  })
})
