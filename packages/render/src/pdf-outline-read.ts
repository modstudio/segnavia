import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, type PDFObject, PDFRef, PDFString } from 'pdf-lib'
import { type BookDestination, namedDestinations } from './book-destinations.ts'
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

function resolve(document: PDFDocument, value: PDFObject | undefined): PDFObject | undefined {
  return value instanceof PDFRef ? document.context.lookup(value) : value
}

function text(value: PDFObject | undefined): string | undefined {
  const found = value instanceof PDFRef ? undefined : value
  if (found instanceof PDFString || found instanceof PDFHexString) return found.decodeText()
  if (found instanceof PDFName) return found.toString().slice(1)
  return undefined
}

function explicitDestination(document: PDFDocument, value: PDFArray): BookDestination | undefined {
  const reference = value.get(0)
  if (!(reference instanceof PDFRef)) return undefined
  const page = document.getPages().findIndex((candidate) => candidate.ref.toString() === reference.toString())
  if (page < 0) return undefined
  const x = resolve(document, value.get(2))
  const y = resolve(document, value.get(3))
  return {
    page: page + 1,
    x: x instanceof PDFNumber ? x.asNumber() : 0,
    y: y instanceof PDFNumber ? y.asNumber() : document.getPage(page).getHeight(),
  }
}

function itemDestination(document: PDFDocument, item: PDFDict, names: ReadonlyMap<string, BookDestination>): BookDestination | undefined {
  let raw = item.get(key('Dest'))
  if (!raw) {
    const action = resolve(document, item.get(key('A')))
    if (action instanceof PDFDict && action.lookupMaybe(key('S'), PDFName) === key('GoTo')) raw = action.get(key('D'))
  }
  if (!raw) return undefined
  const found = resolve(document, raw)
  if (found instanceof PDFArray) {
    const destination = explicitDestination(document, found)
    if (destination) return destination
  } else {
    const name = text(found)
    if (name) {
      const destination = names.get(name)
      if (destination) return destination
    }
  }
  throw new PdfOutlineReadError('A PDF outline destination does not resolve to a page in its part.')
}

export function readPdfOutline(document: PDFDocument): PdfOutlineItem[] {
  const root = resolve(document, document.catalog.get(key('Outlines')))
  if (!(root instanceof PDFDict)) return []
  const names = namedDestinations(document)
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
      const item = resolve(document, current)
      if (!(item instanceof PDFDict)) throw new PdfOutlineReadError('A PDF outline entry is not a dictionary.')
      const title = text(item.get(key('Title')))
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
