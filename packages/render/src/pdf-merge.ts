import { Refusal, resolveDirection, resolveLimits } from '@segnavia/format'
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, type PDFObject, PDFRawStream, PDFRef, PDFString } from 'pdf-lib'
import { explicit, namedDestinations } from './book-destinations.ts'
import { writeDocumentMetadata } from './document-metadata.ts'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import type { MergePdfsOptions } from './merge-pdf-options.ts'
import { enforcePdfBytes } from './pdf-finish.ts'
import { loadPdf } from './pdf-load.ts'
import { combinedPdfOutline, writeMergedPdfOutline } from './pdf-merge-outline.ts'
import { readPdfOutline } from './pdf-outline-read.ts'
import { copyPdfParts } from './pdf-structure-merge.ts'
import type { RenderDeadline } from './render-deadline.ts'

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
  title: string
  outline: ReturnType<typeof readPdfOutline>
  destinations: Map<string, ReturnType<typeof namedDestinations> extends Map<string, infer D> ? D : never>
  pages: number
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

async function loadPart(part: MergePart, index: number, options: MergePdfsOptions): Promise<LoadedPart> {
  const document = await loadPdf(part.pdf, { source: 'received', operation: 'mergePdfs', limits: resolveLimits(undefined, options.limits) })
  const title = part.label === undefined ? documentTitle(document) : (documentTitle(document) ?? part.label)
  if (!title) throw new RenderRefusedError(`PDF part ${index + 1} has no label or document title; pass a label or a titled PDF to clear this refusal.`)
  return {
    index,
    ...(part.label === undefined ? {} : { label: part.label }),
    document,
    title,
    outline: readPdfOutline(document),
    destinations: namedDestinations(document),
    pages: document.getPageCount(),
    tagged: document.catalog.has(key('StructTreeRoot')),
  }
}

function decodedName(value: PDFObject | undefined): string | undefined {
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : value instanceof PDFName ? value.toString().slice(1) : undefined
}

function rewritePartLinks(target: PDFDocument, part: LoadedPart, pageOffset: number): void {
  for (let pageIndex = pageOffset; pageIndex < pageOffset + part.pages; pageIndex += 1) {
    const annotations = resolve(target, target.getPage(pageIndex).node.get(key('Annots')))
    if (!(annotations instanceof PDFArray)) continue
    for (let index = 0; index < annotations.size(); index += 1) {
      const annotation = resolve(target, annotations.get(index))
      if (!(annotation instanceof PDFDict)) continue
      let name = decodedName(resolve(target, annotation.get(key('Dest'))))
      const action = resolve(target, annotation.get(key('A')))
      if (!name && action instanceof PDFDict && action.lookupMaybe(key('S'), PDFName) === key('GoTo')) name = decodedName(resolve(target, action.get(key('D'))))
      if (!name) continue
      const destination = part.destinations.get(name)
      if (!destination) throw new RenderRefusedError(`A link in PDF part ${part.index + 1} names the missing destination ${name}.`)
      annotation.set(key('Dest'), explicit(target, destination, pageOffset))
      annotation.delete(key('A'))
    }
  }
}

function writeQualifiedDestinations(target: PDFDocument, parts: readonly LoadedPart[], offsets: readonly number[]): void {
  const entries = parts.flatMap((part, partIndex) =>
    [...part.destinations].map(([name, destination]) => ({ name: `${part.index + 1}/${name}`, destination, offset: offsets[partIndex] as number })),
  )
  entries.sort((left, right) => left.name.localeCompare(right.name))
  if (entries.length === 0) return
  const names = entries.flatMap((entry) => [PDFHexString.fromText(entry.name), explicit(target, entry.destination, entry.offset)])
  target.catalog.set(key('Names'), target.context.obj({ Dests: { Names: names } }))
}

export async function mergePdfParts(parts: readonly MergePart[], options: MergePdfsOptions, deadline: RenderDeadline): Promise<MergedPdf> {
  const loaded: LoadedPart[] = []
  const refused: PdfPartRefusal[] = []
  for (const [index, part] of parts.entries()) {
    throwIfExpired(deadline)
    try {
      loaded.push(await loadPart(part, index, options))
    } catch (error) {
      refused.push({ index, ...(part.label === undefined ? {} : { label: part.label }), error: asRefusal(error) })
    }
  }
  if (refused.length > 0 && (!options.skipRefused || loaded.length === 0)) throw new PdfPartsRefusedError(refused)
  if (loaded.length === 0) throw new PdfPartsRefusedError(refused)
  const pages = loaded.reduce((sum, part) => sum + part.pages, 0)
  if (options.limits?.sheets !== undefined && pages > options.limits.sheets) throw new RenderLimitError('sheets', pages, options.limits.sheets)
  const offsets = loaded.map((_, index) => loaded.slice(0, index).reduce((sum, part) => sum + part.pages, 0))
  const target = await PDFDocument.create()
  await copyPdfParts(
    target,
    loaded.map((part) => ({ document: part.document, name: `PDF part at index ${part.index}` })),
    { mix: 'untag', lang: options.metadata.lang },
  )
  loaded.forEach((part, index) => {
    rewritePartLinks(target, part, offsets[index] as number)
  })
  writeQualifiedDestinations(target, loaded, offsets)
  const direction = resolveDirection(undefined, options.metadata.lang, options.metadata.title)
  writeMergedPdfOutline(
    target,
    combinedPdfOutline(
      loaded.map((part, index) => ({ outline: part.outline, label: part.label, title: part.title, pageOffset: offsets[index] as number })),
      direction,
    ),
  )
  writeDocumentMetadata(target, options.metadata, undefined, direction)
  throwIfExpired(deadline)
  const pdf = enforcePdfBytes(await target.save(), options.limits)
  const untagged = loaded.filter((part) => !part.tagged).map((part) => part.index)
  return { pdf, tagged: untagged.length === 0, untagged, refused }
}
