import { markedTitle, type TextDirection } from '@segnavia/format'
import type { OutlineNode } from './book-structure.ts'
import type { PdfOutlineItem } from './pdf-outline-read.ts'

export interface MergedOutlinePart {
  outline: PdfOutlineItem[]
  heading: { text: string; mark: boolean }
  pageOffset: number
  firstPageHeight: number
}

function shifted(item: PdfOutlineItem, pageOffset: number): OutlineNode {
  return {
    ...item,
    ...(item.destination ? { destination: { ...item.destination, page: item.destination.page + pageOffset } } : {}),
    children: item.children.map((child) => shifted(child, pageOffset)),
  }
}

export function combinedPdfOutline(parts: readonly MergedOutlinePart[], direction: TextDirection): OutlineNode[] {
  return parts.map((part) => ({
    title: part.heading.mark ? markedTitle(part.heading.text, direction) : part.heading.text,
    destination: { page: part.pageOffset + 1, x: 0, y: part.firstPageHeight },
    open: false,
    children: part.outline.map((item) => shifted(item, part.pageOffset)),
  }))
}
