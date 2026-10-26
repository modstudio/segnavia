import { fromMillimeters } from '@segnavia/format'
import { PDFArray, PDFDict, PDFName, PDFNumber } from 'pdf-lib'
import { RenderRefusedError } from './errors.ts'
import { type PdfRectangle, pt } from './pdf-geometry.ts'
import { loadPdf } from './pdf-load.ts'

interface MillimeterPageSize {
  width: number
  height: number
}

interface PageMargins {
  top: number
  right: number
  bottom: number
  left: number
}

const inches = (millimeters: number) => {
  const value = fromMillimeters(millimeters, 'in')
  const nearbyDecimal = Number(value.toFixed(12))
  const exact = Math.abs(value - nearbyDecimal) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 2 ? nearbyDecimal : value
  return `${exact}in`
}

export const pagePdfSize = (size: MillimeterPageSize, margin?: PageMargins) => ({
  width: inches(size.width),
  height: inches(size.height),
  ...(margin
    ? {
        margin: {
          top: inches(margin.top),
          right: inches(margin.right),
          bottom: inches(margin.bottom),
          left: inches(margin.left),
        },
      }
    : {}),
})

export function pdfPageSizeCorrection(
  printed: PdfRectangle,
  exactMillimeters: MillimeterPageSize,
): { mediaBox: PdfRectangle; translation: { x: number; y: number } } {
  const exact = { width: Number(pt(exactMillimeters.width).toFixed(12)), height: Number(pt(exactMillimeters.height).toFixed(12)) }
  if (Math.abs(printed.width - exact.width) > 2 || Math.abs(printed.height - exact.height) > 2) {
    throw new RenderRefusedError(
      `Chromium printed a ${printed.width.toFixed(2)} x ${printed.height.toFixed(2)} pt page where ${exact.width.toFixed(2)} x ${exact.height.toFixed(2)} pt was requested. Remove any @page size rule that changes the paper, or set preferCssPageSize, to clear this refusal.`,
    )
  }
  return {
    mediaBox: { x: 0, y: 0, width: exact.width, height: exact.height },
    translation: { x: printed.x === 0 ? 0 : -printed.x, y: exact.height - printed.height - printed.y },
  }
}

function translateArray(array: PDFArray, x: number, y: number): void {
  for (let index = 0; index < array.size(); index += 1) {
    const value = array.lookup(index)
    if (value instanceof PDFNumber) array.set(index, PDFNumber.of(value.asNumber() + (index % 2 === 0 ? x : y)))
  }
}

function translateAnnotations(annotations: PDFArray | undefined, x: number, y: number): void {
  if (!annotations) return
  for (let index = 0; index < annotations.size(); index += 1) {
    const annotation = annotations.lookup(index)
    if (!(annotation instanceof PDFDict)) continue
    for (const name of ['Rect', 'QuadPoints']) {
      const points = annotation.lookupMaybe(PDFName.of(name), PDFArray)
      if (points) translateArray(points, x, y)
    }
  }
}

export async function setPdfPageSize(pdf: Uint8Array, size: MillimeterPageSize): Promise<Uint8Array> {
  const document = await loadPdf(pdf, { updateMetadata: false })
  for (const page of document.getPages()) {
    const cropBox = page.node.CropBox()
    const correction = pdfPageSizeCorrection(page.getMediaBox(), size)
    page.translateContent(correction.translation.x, correction.translation.y)
    translateAnnotations(page.node.Annots(), correction.translation.x, correction.translation.y)
    // Keep the exact box at origin 0 because PDF embedders such as pdf-lib ignore a MediaBox origin.
    page.setMediaBox(correction.mediaBox.x, correction.mediaBox.y, correction.mediaBox.width, correction.mediaBox.height)
    if (cropBox) page.setCropBox(correction.mediaBox.x, correction.mediaBox.y, correction.mediaBox.width, correction.mediaBox.height)
    // Plain pages have one exact paper box; press-only boxes would misstate that geometry.
    for (const name of ['BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(PDFName.of(name))
  }
  return document.save()
}
