import type { Book } from '@segnavia/format'
import { type BookDocument, bookOutlineSource } from '@segnavia/html'
import { joinedDestinations, rewriteBookLinks } from './book-destinations.ts'
import type { PrintedPart } from './book-pdf-types.ts'
import { writeDocumentStructure } from './book-structure.ts'
import { RenderRefusedError } from './errors.ts'
import type { OutputDate } from './output-date.ts'
import { createPdf, loadPdf } from './pdf-load.ts'
import { copyPdfParts } from './pdf-structure-merge.ts'

export async function joinBookPdf(
  book: Book,
  built: Pick<BookDocument, 'html' | 'headings'>,
  front: PrintedPart,
  body: PrintedPart,
  marginBytes: Uint8Array,
  date?: OutputDate,
): Promise<Uint8Array> {
  const output = await createPdf()
  const named = [
    { name: 'The front book part', part: front },
    { name: 'The body book part', part: body },
  ].filter((item): item is { name: string; part: PrintedPart & { bytes: Uint8Array } } => item.part.bytes !== undefined)
  await copyPdfParts(output, await Promise.all(named.map(async ({ name, part }) => ({ name, document: await loadPdf(part.bytes) }))))
  const layer = await loadPdf(marginBytes)
  if (layer.getPageCount() !== output.getPageCount()) {
    throw new RenderRefusedError(`The margin layer has ${layer.getPageCount()} pages, but the book has ${output.getPageCount()}.`)
  }
  for (const [index, page] of layer.getPages().entries()) {
    const [embedded] = await output.embedPdf(layer, [index])
    if (embedded) output.getPage(index).drawPage(embedded, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }
  rewriteBookLinks(output, front.pages, front.destinations, body.destinations)
  writeDocumentStructure(output, { metadata: book, source: bookOutlineSource(book, built), destinations: joinedDestinations(front, body) }, date)
  return output.save()
}
