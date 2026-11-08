import type { Book } from '@segnavia/format'
import { PDFArray, PDFDict, type PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString } from 'pdf-lib'

type Check = (what: string, ok: boolean, detail?: string) => void

export interface ExpectedOutlineItem {
  title: string
  page: number
}

export interface OutlineItem extends ExpectedOutlineItem {
  depth: number
}

const resolve = (document: PDFDocument, value: unknown) => (value instanceof PDFRef ? document.context.lookup(value) : value)

function annotationDestination(document: PDFDocument, value: unknown): number | undefined {
  const annotation = resolve(document, value)
  if (!(annotation instanceof PDFDict)) return undefined
  const action = resolve(document, annotation.get(PDFName.of('A')))
  if (action instanceof PDFDict) {
    const uri = resolve(document, action.get(PDFName.of('URI')))
    const text = uri instanceof PDFString || uri instanceof PDFHexString ? uri.decodeText() : ''
    if (text.startsWith('segnavia:')) return -1
  }
  const target = resolve(document, annotation.get(PDFName.of('Dest')))
  if (!(target instanceof PDFArray)) return undefined
  const reference = target.get(0)
  return document.getPages().findIndex((candidate) => candidate.ref.toString() === reference?.toString()) + 1
}

export function annotationDestinations(document: PDFDocument): number[] {
  const output: number[] = []
  for (const page of document.getPages()) {
    const annotations = resolve(document, page.node.get(PDFName.of('Annots')))
    if (!(annotations instanceof PDFArray)) continue
    for (let index = 0; index < annotations.size(); index += 1) {
      const target = annotationDestination(document, annotations.get(index))
      if (target !== undefined) output.push(target)
    }
  }
  return output
}

function textValue(value: unknown): string | undefined {
  return value instanceof PDFString || value instanceof PDFHexString ? value.decodeText() : undefined
}

export function pdfOutlineItems(document: PDFDocument): OutlineItem[] {
  const output: OutlineItem[] = []
  const visit = (value: unknown, depth: number): void => {
    let current = resolve(document, value)
    while (current instanceof PDFDict) {
      const title = textValue(resolve(document, current.get(PDFName.of('Title'))))
      const target = resolve(document, current.get(PDFName.of('Dest')))
      if (title !== undefined && target instanceof PDFArray) {
        const reference = target.get(0)
        const page = document.getPages().findIndex((candidate) => candidate.ref.toString() === reference?.toString()) + 1
        output.push({ title, page, depth })
      }
      visit(current.get(PDFName.of('First')), depth + 1)
      current = resolve(document, current.get(PDFName.of('Next')))
    }
  }
  const outlines = resolve(document, document.catalog.get(PDFName.of('Outlines')))
  if (outlines instanceof PDFDict) visit(outlines.get(PDFName.of('First')), 0)
  return output
}

export function pdfPageLabels(document: PDFDocument): string[] {
  const output = Array.from({ length: document.getPageCount() }, () => '')
  const labels = resolve(document, document.catalog.get(PDFName.of('PageLabels')))
  if (!(labels instanceof PDFDict)) return output
  const numbers = resolve(document, labels.get(PDFName.of('Nums')))
  if (!(numbers instanceof PDFArray)) return output
  for (let offset = 0; offset + 1 < numbers.size(); offset += 2) {
    const index = resolve(document, numbers.get(offset))
    const label = resolve(document, numbers.get(offset + 1))
    if (!(index instanceof PDFNumber) || !(label instanceof PDFDict)) continue
    output[index.asNumber()] = textValue(resolve(document, label.get(PDFName.of('P')))) ?? ''
  }
  return output
}

export function verifyPdfStructure(document: PDFDocument, book: Book, expected: ExpectedOutlineItem[], label: string, check: Check): void {
  const lang = textValue(resolve(document, document.catalog.get(PDFName.of('Lang'))))
  const metadata = resolve(document, document.catalog.get(PDFName.of('Metadata')))
  const xmp = metadata instanceof PDFRawStream ? new TextDecoder().decode(metadata.getContents()) : ''
  const authors = book.authors ?? []
  const subject = book.subject ?? ''
  const actualOutline = pdfOutlineItems(document).map(({ title, page }) => ({ title, page }))
  check(`${label} PDF title metadata matches the book`, document.getTitle() === book.title, document.getTitle())
  check(`${label} catalog language matches the book`, lang === book.lang, lang)
  check(
    `${label} outline titles and explicit destination pages match the contents`,
    JSON.stringify(actualOutline) === JSON.stringify(expected),
    `actual=${JSON.stringify(actualOutline)} expected=${JSON.stringify(expected)}`,
  )
  check(
    `${label} XMP carries escaped title, ordered authors, subject and language`,
    xmp.includes(book.title.replaceAll('&', '&amp;')) &&
      authors.every((author, index) => xmp.indexOf(author) > (index === 0 ? -1 : xmp.indexOf(authors[index - 1] ?? ''))) &&
      xmp.includes(subject.replaceAll('&', '&amp;')) &&
      xmp.includes(`<rdf:li>${book.lang}</rdf:li>`),
  )
}
