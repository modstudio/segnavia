import { MM_PER_PT } from '@segnavia/format'
import { loadPdf } from './pdf-load.ts'

export interface PdfPageSize {
  width: number
  height: number
}

export const millimeterPageSize = (size: PdfPageSize): PdfPageSize => ({ width: size.width / MM_PER_PT, height: size.height / MM_PER_PT })

export const pixelPageSize = (size: PdfPageSize): PdfPageSize => ({ width: (size.width * 72) / 96, height: (size.height * 72) / 96 })

export const pagePdfSize = (size: PdfPageSize): { width: string; height: string } => ({
  width: `${size.width / 72}in`,
  height: `${size.height / 72}in`,
})

export async function setPdfPageSize(pdf: Uint8Array, size: PdfPageSize): Promise<Uint8Array> {
  const document = await loadPdf(pdf)
  for (const page of document.getPages()) page.setMediaBox(0, 0, size.width, size.height)
  return document.save()
}
