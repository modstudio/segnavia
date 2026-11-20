import { markedTitle, type TextDirection } from '@segnavia/format'
import { type PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFRef } from 'pdf-lib'
import { explicit } from './book-destinations.ts'
import type { PdfOutlineItem } from './pdf-outline-read.ts'

export interface MergedOutlinePart {
  outline: PdfOutlineItem[]
  label?: string
  title: string
  pageOffset: number
}

export interface MergedOutlineItem extends PdfOutlineItem {
  children: MergedOutlineItem[]
}

const key = (value: string) => PDFName.of(value)

function shifted(item: PdfOutlineItem, pageOffset: number): MergedOutlineItem {
  return {
    ...item,
    ...(item.destination ? { destination: { ...item.destination, page: item.destination.page + pageOffset } } : {}),
    children: item.children.map((child) => shifted(child, pageOffset)),
  }
}

export function combinedPdfOutline(parts: readonly MergedOutlinePart[], direction: TextDirection): MergedOutlineItem[] {
  return parts.map((part) => ({
    title: part.label === undefined ? part.title : markedTitle(part.label, direction),
    destination: { page: part.pageOffset + 1, x: 0, y: 0 },
    open: false,
    children: part.outline.map((item) => shifted(item, part.pageOffset)),
  }))
}

function descendantCount(item: MergedOutlineItem): number {
  return item.children.reduce((count, child) => count + 1 + descendantCount(child), 0)
}

function writeSiblings(document: PDFDocument, items: readonly MergedOutlineItem[], parent: PDFRef): { first: PDFRef; last: PDFRef } {
  const dictionaries = items.map(() => document.context.obj({}))
  const references = dictionaries.map((dictionary) => document.context.register(dictionary))
  items.forEach((item, index) => {
    const dictionary = dictionaries[index] as PDFDict
    dictionary.set(key('Title'), PDFHexString.fromText(item.title))
    dictionary.set(key('Parent'), parent)
    if (item.destination) dictionary.set(key('Dest'), explicit(document, item.destination, 0))
    const previous = references[index - 1]
    const next = references[index + 1]
    if (previous) dictionary.set(key('Prev'), previous)
    if (next) dictionary.set(key('Next'), next)
    if (item.children.length > 0) {
      const children = writeSiblings(document, item.children, references[index] as PDFRef)
      dictionary.set(key('First'), children.first)
      dictionary.set(key('Last'), children.last)
      const count = descendantCount(item)
      dictionary.set(key('Count'), PDFNumber.of(item.open ? count : -count))
    }
  })
  return { first: references[0] as PDFRef, last: references.at(-1) as PDFRef }
}

export function writeMergedPdfOutline(document: PDFDocument, outline: readonly MergedOutlineItem[]): void {
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
