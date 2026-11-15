import { PDFName, PDFNumber, type PDFPage } from 'pdf-lib'

export interface SourcePdfPageFacts {
  rotate: 0 | 90 | 180 | 270
  userUnit: number
}

/** Reads display facts from a received PDF page, applying PDF defaults. */
export function sourcePdfPageFacts(page: PDFPage): SourcePdfPageFacts {
  const angle = ((page.getRotation().angle % 360) + 360) % 360
  const rotate = (angle === 90 || angle === 180 || angle === 270 ? angle : 0) as SourcePdfPageFacts['rotate']
  const candidate = page.node.lookupMaybe(PDFName.of('UserUnit'), PDFNumber)?.asNumber()
  const userUnit = candidate !== undefined && Number.isFinite(candidate) && candidate > 0 ? candidate : 1
  return { rotate, userUnit }
}
