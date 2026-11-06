import type { DocumentMetadata } from '@segnavia/format'
import { PDFDict, type PDFDocument, PDFHexString, PDFName } from 'pdf-lib'
import { loadPdf } from './pdf-load.ts'

const key = (value: string) => PDFName.of(value)

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function documentXmp(metadata: DocumentMetadata): string {
  const title = escapeXml(metadata.title)
  const languageTitle = metadata.lang ? `<rdf:li xml:lang="${escapeXml(metadata.lang)}">${title}</rdf:li>` : ''
  const creators = metadata.authors?.map((author) => `<rdf:li>${escapeXml(author)}</rdf:li>`).join('')
  const creator = creators ? `<dc:creator><rdf:Seq>${creators}</rdf:Seq></dc:creator>` : ''
  const subject =
    metadata.subject === undefined
      ? ''
      : `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.subject)}</rdf:li></rdf:Alt></dc:description>`
  const language = metadata.lang === undefined ? '' : `<dc:language><rdf:Bag><rdf:li>${escapeXml(metadata.lang)}</rdf:li></rdf:Bag></dc:language>`
  const extra = Object.entries(metadata.extra ?? {})
    .map(([name, value]) => `<pdfx:${name}>${escapeXml(value)}</pdfx:${name}>`)
    .join('')
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/">\n<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li>${languageTitle}</rdf:Alt></dc:title>${creator}${subject}${language}${extra}\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`
}

function infoDictionary(document: PDFDocument): PDFDict | undefined {
  const info = document.context.lookup(document.context.trailerInfo.Info)
  return info instanceof PDFDict ? info : undefined
}

export function writeDocumentMetadata(document: PDFDocument, metadata: DocumentMetadata): void {
  document.setTitle(metadata.title)
  if (metadata.authors) document.setAuthor(metadata.authors.join('; '))
  if (metadata.subject !== undefined) document.setSubject(metadata.subject)
  if (metadata.lang) document.catalog.set(key('Lang'), PDFHexString.fromText(metadata.lang))
  const info = infoDictionary(document)
  if (!info) throw new Error('The PDF document metadata dictionary could not be established.')
  for (const [name, value] of Object.entries(metadata.extra ?? {})) info.set(key(name), PDFHexString.fromText(value))
  const xmp = document.context.stream(new TextEncoder().encode(documentXmp(metadata)), { Type: 'Metadata', Subtype: 'XML' })
  document.catalog.set(key('Metadata'), document.context.register(xmp))
}

export async function withDocumentMetadata(pdf: Uint8Array, metadata?: DocumentMetadata): Promise<Uint8Array> {
  const document = await loadPdf(pdf, { updateMetadata: false })
  if (metadata) writeDocumentMetadata(document, metadata)
  else infoDictionary(document)?.delete(key('Title'))
  return document.save()
}
