import type { DocumentMetadata } from '@segnavia/format'
import { isoDate, type OutputDate } from './output-date.ts'

export function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function documentFields(metadata: DocumentMetadata): string {
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
  return `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li>${languageTitle}</rdf:Alt></dc:title>${creator}${subject}${language}${extra}`
}

export function xmpPacket(metadata?: DocumentMetadata, date?: OutputDate): string {
  const dates = date ? `<xmp:CreateDate>${isoDate(date)}</xmp:CreateDate><xmp:ModifyDate>${isoDate(date)}</xmp:ModifyDate>` : ''
  const fields = metadata ? documentFields(metadata) : ''
  const xmpNamespace = date ? ' xmlns:xmp="http://ns.adobe.com/xap/1.0/"' : ''
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdfx="http://ns.adobe.com/pdfx/1.3/"${xmpNamespace}>\n${fields}${dates}\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`
}

export function xmpDatePacket(date: OutputDate): Uint8Array {
  return new TextEncoder().encode(xmpPacket(undefined, date))
}
