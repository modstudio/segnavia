import { Refusal, resolveDirection, resolveLimits } from '@segnavia/format'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, type PDFObject, PDFRawStream, PDFRef } from 'pdf-lib'
import { type BookDestination, explicit, namedDestinations, pdfAnnotationDestination, pdfObject } from './book-destinations.ts'
import { writeDocumentOutlines } from './book-structure.ts'
import { writeDocumentMetadata } from './document-metadata.ts'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import { type MergePdfsOptions, parseMergePdfsOptions } from './merge-pdf-options.ts'
import { enforcePdfBytes } from './pdf-finish.ts'
import { classifyPdfRewriteFailure, loadPdf } from './pdf-load.ts'
import { combinedPdfOutline } from './pdf-merge-outline.ts'
import { type PdfOutlineItem, readPdfOutline } from './pdf-outline-read.ts'
import { copyPdfParts } from './pdf-structure-merge.ts'
import { type RenderDeadline, withinRenderPermit } from './render-deadline.ts'

export interface MergePart {
  pdf: Uint8Array
  label?: string
}

export interface PdfPartRefusal {
  index: number
  label?: string
  error: Refusal
}

export interface MergedPdf {
  pdf: Uint8Array
  tagged: boolean
  untagged: number[]
  refused: PdfPartRefusal[]
}

export class PdfPartsRefusedError extends Refusal {
  readonly entries: readonly PdfPartRefusal[]

  constructor(entries: readonly PdfPartRefusal[]) {
    super(
      'pdf-parts',
      entries.length === 0
        ? 'No PDF parts were supplied; pass at least one readable part to clear this refusal.'
        : `PDF parts were refused: ${entries.map((entry) => `part ${entry.index + 1}: ${entry.error.message}`).join('; ')}`,
      {
        refusals: entries.map((entry) => ({ code: entry.error.code, subject: `part ${entry.index + 1}`, message: entry.error.message })),
      },
    )
    this.name = 'PdfPartsRefusedError'
    this.entries = entries
  }
}

interface LoadedPart {
  index: number
  label?: string
  document: PDFDocument
  heading: { text: string; mark: boolean }
  outline: PdfOutlineItem[]
  destinations: Map<string, BookDestination>
  links: Array<{ page: number; annotation: number; destination: BookDestination }>
  pages: number
  firstPageHeight: number
  tagged: boolean
}

const key = (value: string) => PDFName.of(value)
const resolve = (document: PDFDocument, value: PDFObject | undefined): PDFObject | undefined =>
  value instanceof PDFRef ? document.context.lookup(value) : value

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function documentTitle(document: PDFDocument): string | undefined {
  const info = document.getTitle()
  if (info?.trim()) return info
  const metadata = resolve(document, document.catalog.get(key('Metadata')))
  if (!(metadata instanceof PDFRawStream)) return undefined
  const xml = new TextDecoder().decode(metadata.getContents())
  const body = xml.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1]
  const title = body?.match(/<rdf:li\b[^>]*>([\s\S]*?)<\/rdf:li>/i)?.[1] ?? body
  const plain = title?.replace(/<[^>]+>/g, '').trim()
  return plain ? decodeXml(plain) : undefined
}

function asRefusal(error: unknown): Refusal {
  if (error instanceof Refusal) return error
  return new RenderRefusedError('The PDF has unsupported malformed structure; use a valid PDF produced by the renderer to clear this refusal.', {
    cause: error,
  })
}

function throwIfExpired(deadline: RenderDeadline): void {
  if (deadline.signal.aborted) throw deadline.signal.reason
}

function partLinks(document: PDFDocument, destinations: ReadonlyMap<string, BookDestination>, partIndex: number): LoadedPart['links'] {
  const links: LoadedPart['links'] = []
  for (const [pageIndex, page] of document.getPages().entries()) {
    const annotations = pdfObject(document, page.node.get(key('Annots')))
    if (!(annotations instanceof PDFArray)) continue
    for (let annotationIndex = 0; annotationIndex < annotations.size(); annotationIndex += 1) {
      const resolved = pdfAnnotationDestination(document, annotations.get(annotationIndex), destinations)
      if (!resolved || resolved.annotation.lookupMaybe(key('Subtype'), PDFName) !== key('Link') || !resolved.present) continue
      if (!resolved.destination) {
        const subject = resolved.name ? `the missing destination ${resolved.name}` : 'a destination outside its part'
        throw new RenderRefusedError(`A link in PDF part ${partIndex + 1} names ${subject}.`)
      }
      links.push({ page: pageIndex, annotation: annotationIndex, destination: resolved.destination })
      resolved.annotation.delete(key('Dest'))
      if (resolved.action?.lookupMaybe(key('S'), PDFName) === key('GoTo')) resolved.annotation.delete(key('A'))
    }
  }
  return links
}

async function loadPart(part: MergePart, index: number, options: MergePdfsOptions): Promise<LoadedPart> {
  const document = await loadPdf(part.pdf, { source: 'received', operation: 'mergePdfs', limits: resolveLimits(undefined, options.limits) })
  const heading = part.label === undefined ? { text: documentTitle(document) ?? '', mark: false } : { text: part.label, mark: true }
  if (!heading.text) throw new RenderRefusedError(`PDF part ${index + 1} has no label or document title; pass a label or a titled PDF to clear this refusal.`)
  const structure = document.catalog.get(key('StructTreeRoot'))
  if (structure && !(pdfObject(document, structure) instanceof PDFDict)) {
    throw new RenderRefusedError(`PDF part ${index + 1} has a structure root that is not a dictionary.`)
  }
  const destinations = namedDestinations(document)
  const links = partLinks(document, destinations, index)
  return {
    index,
    ...(part.label === undefined ? {} : { label: part.label }),
    document,
    heading,
    outline: readPdfOutline(document, destinations),
    destinations,
    links,
    pages: document.getPageCount(),
    firstPageHeight: document.getPage(0).getHeight(),
    tagged: structure !== undefined,
  }
}

function rewritePartLinks(target: PDFDocument, part: LoadedPart, pageOffset: number): void {
  for (const link of part.links) {
    const annotations = pdfObject(target, target.getPage(pageOffset + link.page).node.get(key('Annots')))
    if (!(annotations instanceof PDFArray)) throw new RenderRefusedError(`A copied link in PDF part ${part.index + 1} has no annotation array.`)
    const annotation = pdfObject(target, annotations.get(link.annotation))
    if (!(annotation instanceof PDFDict)) throw new RenderRefusedError(`A copied link in PDF part ${part.index + 1} is not a dictionary.`)
    annotation.set(key('Dest'), explicit(target, link.destination, pageOffset))
    annotation.delete(key('A'))
  }
}

function writeQualifiedDestinations(target: PDFDocument, parts: readonly LoadedPart[], offsets: readonly number[]): void {
  const entries = parts.flatMap((part, partIndex) =>
    [...part.destinations].map(([name, destination]) => ({ name: `${part.index + 1}/${name}`, destination, offset: offsets[partIndex] as number })),
  )
  entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
  if (entries.length === 0) return
  const names = entries.flatMap((entry) => [PDFHexString.fromText(entry.name), explicit(target, entry.destination, entry.offset)])
  target.catalog.set(key('Names'), target.context.obj({ Dests: { Names: names } }))
}

export async function mergePdfParts(parts: readonly MergePart[], options: MergePdfsOptions, deadline: RenderDeadline): Promise<MergedPdf> {
  const loaded: LoadedPart[] = []
  const refused: PdfPartRefusal[] = []
  let pages = 0
  for (const [index, part] of parts.entries()) {
    throwIfExpired(deadline)
    let loadedPart: LoadedPart
    try {
      loadedPart = await loadPart(part, index, options)
    } catch (error) {
      refused.push({ index, ...(part.label === undefined ? {} : { label: part.label }), error: asRefusal(error) })
      continue
    }
    pages += loadedPart.pages
    if (options.limits?.sheets !== undefined && pages > options.limits.sheets) throw new RenderLimitError('sheets', pages, options.limits.sheets)
    loaded.push(loadedPart)
  }
  if (refused.length > 0 && (!options.skipRefused || loaded.length === 0)) throw new PdfPartsRefusedError(refused)
  if (loaded.length === 0) throw new PdfPartsRefusedError(refused)
  const offsets: number[] = []
  let offset = 0
  for (const part of loaded) {
    offsets.push(offset)
    offset += part.pages
  }
  try {
    const target = await PDFDocument.create()
    await copyPdfParts(
      target,
      loaded.map((part) => ({ document: part.document, name: `PDF part at index ${part.index}` })),
      { mix: 'untag', lang: options.metadata.lang },
    )
    throwIfExpired(deadline)
    loaded.forEach((part, index) => {
      rewritePartLinks(target, part, offsets[index] as number)
    })
    throwIfExpired(deadline)
    writeQualifiedDestinations(target, loaded, offsets)
    const direction = resolveDirection(undefined, options.metadata.lang, options.metadata.title)
    writeDocumentOutlines(
      target,
      combinedPdfOutline(
        loaded.map((part, index) => ({
          outline: part.outline,
          heading: part.heading,
          pageOffset: offsets[index] as number,
          firstPageHeight: part.firstPageHeight,
        })),
        direction,
      ),
    )
    writeDocumentMetadata(target, options.metadata, undefined, direction)
    throwIfExpired(deadline)
    const pdf = enforcePdfBytes(await target.save(), options.limits)
    const untagged = loaded.filter((part) => !part.tagged).map((part) => part.index)
    return { pdf, tagged: untagged.length === 0, untagged, refused }
  } catch (error) {
    throw classifyPdfRewriteFailure('rewrite', error, 'PDF merge')
  }
}

export function createMergePdfsOperation(
  acquire: () => Promise<void>,
  release: () => void,
  defaultBoundMs: number,
): (parts: MergePart[], options: MergePdfsOptions) => Promise<MergedPdf> {
  return async (parts, options) => {
    const parsed = parseMergePdfsOptions(options)
    return withinRenderPermit(parsed.boundMs ?? defaultBoundMs, acquire, release, (deadline) => mergePdfParts(parts, parsed, deadline))
  }
}
