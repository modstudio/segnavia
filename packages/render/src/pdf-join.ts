import { PDFDocument } from 'pdf-lib'
import { loadPdf } from './pdf-load.ts'

export async function joinPdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  const joined = await PDFDocument.create()
  for (const bytes of pdfs) {
    const source = await loadPdf(bytes)
    const pages = await joined.copyPages(source, source.getPageIndices())
    for (const page of pages) joined.addPage(page)
  }
  return joined.save()
}
