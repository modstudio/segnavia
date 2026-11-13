import { type Book, documentOutline, markedTitle, type OutlineSource, type TextDirection } from '@segnavia/format'
import { type PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef } from 'pdf-lib'
import { type BookDestination, explicit } from './book-destinations.ts'
import { writeDocumentMetadata } from './document-metadata.ts'
import { RenderRefusedError } from './errors.ts'
import type { OutputDate } from './output-date.ts'

interface DocumentOutlineItem {
  id: string
  title: string
  destination: BookDestination
  direction: TextDirection
  children: DocumentOutlineItem[]
}

export function outlineTitle(title: string, direction: TextDirection): string {
  return markedTitle(title, direction)
}

export function writePlanFolios(document: PDFDocument, folios: readonly (string | null)[]): void {
  if (folios.length === 0) return
  const numbers = folios.flatMap((folio, index) => [PDFNumber.of(index), document.context.obj({ P: PDFHexString.fromText(folio ?? '') })])
  document.catalog.set(key('PageLabels'), document.context.obj({ Nums: numbers }))
}

function outlineTree(source: OutlineSource, destinations: Map<string, BookDestination>): DocumentOutlineItem[] {
  const roots: DocumentOutlineItem[] = []
  const stack: DocumentOutlineItem[] = []
  for (const entry of documentOutline(source)) {
    const destination = destinations.get(entry.id)
    if (!destination) throw new RenderRefusedError(`The heading ${entry.id} has no printed destination.`)
    const item: DocumentOutlineItem = {
      id: entry.id,
      title: entry.title,
      destination,
      direction: source.direction,
      children: [],
    }
    while (stack.length >= entry.depth) stack.pop()
    const parent = stack.at(-1)
    if (parent) parent.children.push(item)
    else roots.push(item)
    stack.push(item)
  }
  return roots
}

const key = (value: string) => PDFName.of(value)

function descendantCount(item: DocumentOutlineItem): number {
  return item.children.reduce((count, child) => count + 1 + descendantCount(child), 0)
}

function writeSiblings(document: PDFDocument, items: DocumentOutlineItem[], parent: PDFRef): { first: PDFRef; last: PDFRef } {
  const dictionaries = items.map(() => document.context.obj({}))
  const references = dictionaries.map((dictionary) => document.context.register(dictionary))
  items.forEach((item, index) => {
    const dictionary = dictionaries[index] as PDFDict
    dictionary.set(key('Title'), PDFHexString.fromText(outlineTitle(item.title, item.direction)))
    dictionary.set(key('Parent'), parent)
    dictionary.set(key('Dest'), explicit(document, item.destination, 0))
    const previous = references[index - 1]
    const next = references[index + 1]
    if (previous) dictionary.set(key('Prev'), previous)
    if (next) dictionary.set(key('Next'), next)
    if (item.children.length > 0) {
      const children = writeSiblings(document, item.children, references[index] as PDFRef)
      dictionary.set(key('First'), children.first)
      dictionary.set(key('Last'), children.last)
      dictionary.set(key('Count'), PDFNumber.of(-descendantCount(item)))
    }
  })
  return { first: references[0] as PDFRef, last: references.at(-1) as PDFRef }
}

export function writeDocumentStructure(
  document: PDFDocument,
  input: { source: OutlineSource; destinations: Map<string, BookDestination>; metadata?: Book },
  date?: OutputDate,
): void {
  const direction = input.source.direction
  if (input.metadata) writeDocumentMetadata(document, input.metadata, date, direction)
  writeDocumentOutlines(document, [input])
}

export function writeDocumentOutlines(
  document: PDFDocument,
  inputs: ReadonlyArray<{ source: OutlineSource; destinations: Map<string, BookDestination> }>,
): void {
  const outline = inputs.flatMap((input) => outlineTree(input.source, input.destinations))
  if (outline.length === 0) return
  const root = document.context.obj({ Type: 'Outlines' })
  const rootReference = document.context.register(root)
  const siblings = writeSiblings(document, outline, rootReference)
  root.set(key('First'), siblings.first)
  root.set(key('Last'), siblings.last)
  root.set(key('Count'), PDFNumber.of(outline.length))
  document.catalog.set(key('Outlines'), rootReference)
  document.catalog.set(key('PageMode'), key('UseOutlines'))
}
