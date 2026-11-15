import type { OutlineSource } from '@segnavia/format'
import { namedDestinations } from './book-destinations.ts'
import { writeDocumentStructure } from './book-structure.ts'
import { loadPdf } from './pdf-load.ts'

export async function addPdfOutline(bytes: Uint8Array, source: OutlineSource | undefined): Promise<Uint8Array> {
  if (!source) return bytes
  const document = await loadPdf(bytes)
  writeDocumentStructure(document, { source, destinations: namedDestinations(document) })
  return document.save()
}
