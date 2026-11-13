import { createPdf, loadPdf } from './pdf-load.ts'
import { copyPdfParts } from './pdf-structure-merge.ts'

export async function joinPdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  const joined = await createPdf()
  const parts = await Promise.all(pdfs.map(async (bytes, index) => ({ document: await loadPdf(bytes), name: `PDF part at index ${index}` })))
  await copyPdfParts(joined, parts)
  return joined.save()
}
