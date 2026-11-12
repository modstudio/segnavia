import { type Direction, type DocumentMetadata, markedTitle, resolveDirection } from '@segnavia/format'
import { PDFDict, type PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib'
import { type OutputDate, pdfDate } from './output-date.ts'
import { loadPdf } from './pdf-load.ts'
import { xmpPacket } from './xmp.ts'

const key = (value: string) => PDFName.of(value)

function infoDictionary(document: PDFDocument): PDFDict | undefined {
  const info = document.context.lookup(document.context.trailerInfo.Info)
  return info instanceof PDFDict ? info : undefined
}

function writeDescriptiveMetadata(document: PDFDocument, metadata: DocumentMetadata): void {
  document.setTitle(metadata.title)
  if (metadata.authors?.length) document.setAuthor(metadata.authors.join('; '))
  if (metadata.subject !== undefined) document.setSubject(metadata.subject)
  if (metadata.lang) document.catalog.set(key('Lang'), PDFHexString.fromText(metadata.lang))
}

function markedMetadata(metadata: DocumentMetadata, dir?: Direction): DocumentMetadata {
  const direction = resolveDirection(dir, metadata.lang, metadata.title)
  return {
    ...metadata,
    title: markedTitle(metadata.title, direction),
    ...(metadata.authors?.length ? { authors: metadata.authors.map((author) => markedTitle(author, direction)) } : {}),
    ...(metadata.subject === undefined ? {} : { subject: markedTitle(metadata.subject, direction) }),
  }
}

export function writeDocumentMetadata(document: PDFDocument, metadata?: DocumentMetadata, date?: OutputDate, dir?: Direction): void {
  const descriptive = metadata && markedMetadata(metadata, dir)
  const needsInfo = metadata !== undefined || date !== undefined
  if (descriptive) writeDescriptiveMetadata(document, descriptive)
  else if (document.getTitle() === 'about:blank') infoDictionary(document)?.delete(key('Title'))
  let info = infoDictionary(document)
  // Descriptive metadata and dates both need Info; either may establish it when the source PDF has none.
  if (needsInfo && !info) {
    info = document.context.obj({})
    document.context.trailerInfo.Info = document.context.register(info)
  }
  for (const name of ['CreationDate', 'ModDate', 'Producer', 'Creator']) info?.delete(key(name))
  if (metadata) for (const [name, value] of Object.entries(metadata.extra ?? {})) info?.set(key(name), PDFHexString.fromText(value))
  if (date) {
    const value = PDFString.of(pdfDate(date))
    info?.set(key('CreationDate'), value)
    info?.set(key('ModDate'), value)
  }
  if (metadata || date) {
    const xmp = document.context.stream(new TextEncoder().encode(xmpPacket(descriptive, date)), { Type: 'Metadata', Subtype: 'XML' })
    document.catalog.set(key('Metadata'), document.context.register(xmp))
  }
}

export async function withDocumentMetadata(pdf: Uint8Array, metadata?: DocumentMetadata, date?: OutputDate): Promise<Uint8Array> {
  const document = await loadPdf(pdf)
  writeDocumentMetadata(document, metadata, date)
  return document.save()
}
