import { PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject } from 'pdf-lib'
import { type BookDestination, namedDestinations, pdfDestination, pdfObject, pdfText } from './book-destinations.ts'
import { RenderRefusedError } from './errors.ts'

export interface PdfOutlineItem {
  title: string
  destination?: BookDestination
  open: boolean
  children: PdfOutlineItem[]
}

export class PdfOutlineReadError extends RenderRefusedError {
  override name = 'PdfOutlineReadError'
}

const key = (value: string) => PDFName.of(value)

function itemDestination(document: PDFDocument, item: PDFDict, names: ReadonlyMap<string, BookDestination>): BookDestination | undefined {
  let raw = item.get(key('Dest'))
  if (!raw) {
    const action = pdfObject(document, item.get(key('A')))
    if (action instanceof PDFDict && action.lookupMaybe(key('S'), PDFName) === key('GoTo')) raw = action.get(key('D'))
  }
  if (!raw) return undefined
  const destination = pdfDestination(document, raw, names)
  if (destination) return destination
  throw new PdfOutlineReadError('A PDF outline destination does not resolve to a page in its part.')
}

export function readPdfOutline(document: PDFDocument, names: ReadonlyMap<string, BookDestination> = namedDestinations(document)): PdfOutlineItem[] {
  const root = pdfObject(document, document.catalog.get(key('Outlines')))
  if (!(root instanceof PDFDict)) return []
  const visited = new Set<PDFObject>()
  let entries = 0

  const siblings = (first: PDFObject | undefined, depth: number): PdfOutlineItem[] => {
    if (!first) return []
    if (depth > 64) throw new PdfOutlineReadError('A PDF outline is deeper than the limit of 64 levels.')
    const output: PdfOutlineItem[] = []
    let current: PDFObject | undefined = first
    while (current) {
      if (visited.has(current)) throw new PdfOutlineReadError('A PDF outline contains a cycle.')
      visited.add(current)
      entries += 1
      if (entries > 10_000) throw new PdfOutlineReadError('A PDF outline has more than the limit of 10000 entries.')
      const item = pdfObject(document, current)
      if (!(item instanceof PDFDict)) throw new PdfOutlineReadError('A PDF outline entry is not a dictionary.')
      const title = pdfText(pdfObject(document, item.get(key('Title'))))
      if (title === undefined) throw new PdfOutlineReadError('A PDF outline entry has no readable title.')
      const count = item.lookupMaybe(key('Count'), PDFNumber)?.asNumber() ?? 0
      output.push({
        title,
        destination: itemDestination(document, item, names),
        open: count >= 0,
        children: siblings(item.get(key('First')), depth + 1),
      })
      current = item.get(key('Next'))
    }
    return output
  }

  return siblings(root.get(key('First')), 1)
}
