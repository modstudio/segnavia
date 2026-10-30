import { type Book, firstStrongDirection, resolveDirection } from '@segnavia/format'
import type { BookHeading } from '@segnavia/html'
import { type PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef } from 'pdf-lib'
import { type BookDestination, explicit } from './book-destinations.ts'
import { RenderRefusedError } from './errors.ts'

export type BookMetadata = Pick<Book, 'title' | 'authors' | 'subject' | 'lang'>

export interface BookOutlineItem {
  id: string
  title: string
  destination: BookDestination
  children: BookOutlineItem[]
}

function markedTitle(title: string, direction: 'ltr' | 'rtl'): string {
  const natural = firstStrongDirection(title) ?? 'ltr'
  if (natural === direction) return title
  return `${direction === 'rtl' ? '\u200f' : '\u200e'}${title}`
}

export function outlineTitle(title: string, dir: Book['dir'], lang: Book['lang']): string {
  return markedTitle(title, resolveDirection(dir, lang, title))
}

export function bookOutline(headings: BookHeading[], destinations: Map<string, BookDestination>): BookOutlineItem[] {
  const roots: BookOutlineItem[] = []
  const stack: Array<{ level: number; item: BookOutlineItem }> = []
  for (const heading of headings) {
    const level = heading.level + (heading.depth ?? 0)
    const destination = destinations.get(heading.id)
    if (!destination) throw new RenderRefusedError(`The heading ${heading.id} has no printed destination.`)
    const item: BookOutlineItem = {
      id: heading.id,
      title: heading.text,
      destination,
      children: [],
    }
    while ((stack.at(-1)?.level ?? 0) >= level) stack.pop()
    const parent = stack.at(-1)?.item
    if (parent) parent.children.push(item)
    else roots.push(item)
    stack.push({ level, item })
  }
  return roots
}

function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

export function bookXmp(metadata: BookMetadata): string {
  const title = escapeXml(metadata.title)
  const languageTitle = metadata.lang ? `<rdf:li xml:lang="${escapeXml(metadata.lang)}">${title}</rdf:li>` : ''
  const creators = metadata.authors?.map((author) => `<rdf:li>${escapeXml(author)}</rdf:li>`).join('')
  const creator = creators ? `<dc:creator><rdf:Seq>${creators}</rdf:Seq></dc:creator>` : ''
  const subject =
    metadata.subject === undefined
      ? ''
      : `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(metadata.subject)}</rdf:li></rdf:Alt></dc:description>`
  const language = metadata.lang === undefined ? '' : `<dc:language><rdf:Bag><rdf:li>${escapeXml(metadata.lang)}</rdf:li></rdf:Bag></dc:language>`
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/">\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${title}</rdf:li>${languageTitle}</rdf:Alt></dc:title>${creator}${subject}${language}\n</rdf:Description>\n</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`
}

const key = (value: string) => PDFName.of(value)

function descendantCount(item: BookOutlineItem): number {
  return item.children.reduce((count, child) => count + 1 + descendantCount(child), 0)
}

function writeSiblings(
  document: PDFDocument,
  items: BookOutlineItem[],
  parent: PDFRef,
  direction: Pick<Book, 'dir' | 'lang'>,
): { first: PDFRef; last: PDFRef } {
  const dictionaries = items.map(() => document.context.obj({}))
  const references = dictionaries.map((dictionary) => document.context.register(dictionary))
  items.forEach((item, index) => {
    const dictionary = dictionaries[index] as PDFDict
    dictionary.set(key('Title'), PDFHexString.fromText(outlineTitle(item.title, direction.dir, direction.lang)))
    dictionary.set(key('Parent'), parent)
    dictionary.set(key('Dest'), explicit(document, item.destination, 0))
    const previous = references[index - 1]
    const next = references[index + 1]
    if (previous) dictionary.set(key('Prev'), previous)
    if (next) dictionary.set(key('Next'), next)
    if (item.children.length > 0) {
      const children = writeSiblings(document, item.children, references[index] as PDFRef, direction)
      dictionary.set(key('First'), children.first)
      dictionary.set(key('Last'), children.last)
      dictionary.set(key('Count'), PDFNumber.of(-descendantCount(item)))
    }
  })
  return { first: references[0] as PDFRef, last: references.at(-1) as PDFRef }
}

export function writeBookStructure(document: PDFDocument, input: { headings: BookHeading[]; destinations: Map<string, BookDestination>; book: Book }): void {
  const metadata = input.book
  document.setTitle(metadata.title)
  if (metadata.authors) document.setAuthor(metadata.authors.join('; '))
  if (metadata.subject !== undefined) document.setSubject(metadata.subject)
  if (metadata.lang) document.catalog.set(key('Lang'), PDFHexString.fromText(metadata.lang))
  const xmp = document.context.stream(new TextEncoder().encode(bookXmp(metadata)), { Type: 'Metadata', Subtype: 'XML' })
  document.catalog.set(key('Metadata'), document.context.register(xmp))

  const outline = bookOutline(input.headings, input.destinations)
  if (outline.length === 0) return
  const root = document.context.obj({ Type: 'Outlines' })
  const rootReference = document.context.register(root)
  const siblings = writeSiblings(document, outline, rootReference, input.book)
  root.set(key('First'), siblings.first)
  root.set(key('Last'), siblings.last)
  root.set(key('Count'), PDFNumber.of(outline.length))
  document.catalog.set(key('Outlines'), rootReference)
  document.catalog.set(key('PageMode'), key('UseOutlines'))
}
