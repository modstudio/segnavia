import { MM_PER_PT } from '@segnavia/format'
import { PDFArray, PDFDict, PDFName, PDFNumber } from 'pdf-lib'
import { loadPdf } from './pdf-load.ts'

export interface PdfPageSize {
  width: number
  height: number
}

interface PdfPageBox extends PdfPageSize {
  x: number
  y: number
}

interface PageMargins {
  top: number
  right: number
  bottom: number
  left: number
}

export const millimeterPageSize = (size: PdfPageSize): PdfPageSize => ({ width: size.width / MM_PER_PT, height: size.height / MM_PER_PT })

const inches = (points: number) => {
  const value = points / 72
  const nearbyDecimal = Number(value.toFixed(12))
  const exact = Math.abs(value - nearbyDecimal) <= Number.EPSILON * Math.max(1, Math.abs(value)) * 2 ? nearbyDecimal : value
  return `${exact}in`
}

export const pagePdfSize = (size: PdfPageSize, margin?: PageMargins) => ({
  width: inches(size.width),
  height: inches(size.height),
  ...(margin
    ? {
        margin: {
          top: inches(margin.top / MM_PER_PT),
          right: inches(margin.right / MM_PER_PT),
          bottom: inches(margin.bottom / MM_PER_PT),
          left: inches(margin.left / MM_PER_PT),
        },
      }
    : {}),
})

export function pdfPageSizeCorrection(printed: PdfPageBox, exact: PdfPageSize): { mediaBox: PdfPageBox; translation: { x: number; y: number } } {
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

export async function setPdfPageSize(pdf: Uint8Array, size: PdfPageSize): Promise<Uint8Array> {
  const document = await loadPdf(pdf)
  for (const page of document.getPages()) {
    const cropBox = page.node.CropBox()
    const correction = pdfPageSizeCorrection(page.getMediaBox(), size)
    page.translateContent(correction.translation.x, correction.translation.y)
    translateAnnotations(page.node.Annots(), correction.translation.x, correction.translation.y)
    page.setMediaBox(correction.mediaBox.x, correction.mediaBox.y, correction.mediaBox.width, correction.mediaBox.height)
    if (cropBox) page.setCropBox(correction.mediaBox.x, correction.mediaBox.y, correction.mediaBox.width, correction.mediaBox.height)
    for (const name of ['BleedBox', 'TrimBox', 'ArtBox']) page.node.delete(PDFName.of(name))
  }
  return document.save()
}
