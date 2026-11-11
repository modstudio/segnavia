import type { TextDirection } from '@segnavia/format'
import { type Book, firstStrongDirection, resolveDirection } from '@segnavia/format'
import { type BookHeading, headingLabel } from '@segnavia/html'
import { type PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef } from 'pdf-lib'
import { type BookDestination, explicit } from './book-destinations.ts'
import { writeDocumentMetadata } from './document-metadata.ts'
import { RenderRefusedError } from './errors.ts'
import type { OutputDate } from './output-date.ts'

export interface BookOutlineItem {
  id: string
  title: string
  destination: BookDestination
  children: BookOutlineItem[]
}

function markedTitle(title: string, direction: TextDirection): string {
  const natural = firstStrongDirection(title) ?? 'ltr'
  if (natural === direction) return title
  return `${direction === 'rtl' ? '\u200f' : '\u200e'}${title}`
}

export function outlineTitle(title: string, dir: Book['dir'], lang: Book['lang']): string {
  return markedTitle(title, resolveDirection(dir, lang, title))
}

export function writePlanFolios(document: PDFDocument, folios: readonly (string | null)[]): void {
  if (folios.length === 0) return
  const numbers = folios.flatMap((folio, index) => [PDFNumber.of(index), document.context.obj({ P: PDFHexString.fromText(folio ?? '') })])
  document.catalog.set(key('PageLabels'), document.context.obj({ Nums: numbers }))
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
      title: headingLabel(heading),
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

export function writeBookStructure(
  document: PDFDocument,
  input: { headings: BookHeading[]; destinations: Map<string, BookDestination>; book: Book },
  date?: OutputDate,
): void {
  writeDocumentMetadata(document, input.book, date)

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
