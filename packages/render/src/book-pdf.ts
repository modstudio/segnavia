import { Book, type BookInput, formatNumber, resolveDirection, sheetMm } from '@segnavia/format'
import { type BookDocument, type BookHeading, type BookSectionInfo, bookDocument } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { type BookDestination, namedDestinations, rewriteBookLinks } from './book-destinations.ts'
import { type MarginPage, marginDocument } from './book-margins.ts'
import { RenderRefusedError } from './errors.ts'
import type { RenderOptions } from './options.ts'

export interface BookPdfAdapter {
  print(html: string, book: Book, options: RenderOptions, marginLayer?: boolean): Promise<Uint8Array>
  finish(pdf: Uint8Array, options: RenderOptions): Promise<Uint8Array>
}

interface PrintedPart {
  bytes?: Uint8Array
  pages: number
  destinations: Map<string, BookDestination>
}

async function inspect(bytes: Uint8Array): Promise<PrintedPart> {
  const document = await PDFDocument.load(bytes)
  return { bytes, pages: document.getPageCount(), destinations: namedDestinations(document) }
}

function hashTargets(document: BookDocument): string[] {
  return [...new Set([...document.html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1] as string))]
}

function requireTargets(part: PrintedPart, expected: string[]): void {
  const missing = expected.filter((id) => !part.destinations.has(id))
  if (missing.length > 0) {
    throw new RenderRefusedError(
      `Chromium wrote ${expected.length - missing.length} of ${expected.length} named destinations for hidden targets; missing ${missing.join(', ')}.`,
    )
  }
}

const frontSections = (sections: BookSectionInfo[]) => sections.filter((section) => section.kind === 'front' || section.kind === 'contents')
const bodySections = (sections: BookSectionInfo[]) => sections.filter((section) => section.kind === 'chapter' || section.kind === 'endnotes')

function planBlanks(sections: BookSectionInfo[], destinations: Map<string, BookDestination>) {
  const ids: string[] = []
  const predicted = new Map<string, number>()
  let blanks = 0
  for (const section of bodySections(sections)) {
    const original = destinations.get(section.id)?.page
    if (original === undefined) throw new RenderRefusedError(`The first body print has no destination for ${section.id}.`)
    let page = original + blanks
    if (page % 2 === 0) {
      ids.push(section.id)
      blanks += 1
      page += 1
    }
    predicted.set(section.id, page)
  }
  return { ids, predicted }
}

function verifyStarts(label: string, sections: BookSectionInfo[], expected: Map<string, number>, actual: Map<string, BookDestination>): void {
  for (const section of sections) {
    const predicted = expected.get(section.id)
    const found = actual.get(section.id)?.page
    if (predicted !== found) {
      throw new RenderRefusedError(`${section.id} was predicted to start on ${label} page ${predicted}, but started on page ${found}.`)
    }
  }
}

async function appendBlank(part: PrintedPart): Promise<PrintedPart> {
  if (!part.bytes) return part
  const document = await PDFDocument.load(part.bytes)
  const last = document.getPage(document.getPageCount() - 1)
  document.addPage([last.getWidth(), last.getHeight()])
  return { ...part, bytes: await document.save(), pages: part.pages + 1 }
}

function pageSide(book: Book, physicalPage: number): 'left' | 'right' {
  const odd = resolveDirection(book.dir, book.lang, book.title) === 'rtl' ? 'left' : 'right'
  return physicalPage % 2 === 1 ? odd : odd === 'left' ? 'right' : 'left'
}

function marginsFor(
  book: Book,
  sections: BookSectionInfo[],
  destinations: Map<string, BookDestination>,
  pages: number,
  offset: number,
  blanks: Set<number>,
  system: Book['numbering']['body'],
): MarginPage[] {
  const starts = sections
    .flatMap((section) => {
      const page = destinations.get(section.id)?.page
      return page === undefined ? [] : [{ page, section }]
    })
    .sort((left, right) => left.page - right.page)
  return Array.from({ length: pages }, (_, index): MarginPage => {
    const page = index + 1
    if (blanks.has(page)) return { kind: 'blank', side: pageSide(book, offset + page) }
    const owner = starts.filter((start) => start.page <= page).at(-1)
    return {
      kind: owner?.section.kind ?? 'blank',
      side: pageSide(book, offset + page),
      folio: formatNumber(page, system),
      runningHead: owner?.page === page ? undefined : owner?.section.runningHead,
    }
  })
}

function placeholderNumbers(book: Book, document: BookDocument, lastBodyPage: number): Record<string, string> {
  const body = formatNumber(Math.max(1, lastBodyPage), book.numbering.body)
  const front = formatNumber(Math.max(1, book.frontMatter.length), book.numbering.frontMatter)
  const kinds = new Map(document.sections.map((section) => [section.id, section.kind]))
  return Object.fromEntries(document.headings.map((heading) => [heading.id, kinds.get(heading.sectionId) === 'front' ? front : body]))
}

function finalNumbers(book: Book, headings: BookHeading[], front: PrintedPart, body: PrintedPart): Record<string, string> {
  return Object.fromEntries(
    headings.map((heading) => {
      const frontPage = front.destinations.get(heading.id)?.page
      if (frontPage !== undefined) return [heading.id, formatNumber(frontPage, book.numbering.frontMatter)]
      const bodyPage = body.destinations.get(heading.id)?.page
      if (bodyPage === undefined) throw new RenderRefusedError(`The heading ${heading.id} has no printed destination.`)
      return [heading.id, formatNumber(bodyPage, book.numbering.body)]
    }),
  )
}

async function printBody(book: Book, options: RenderOptions, adapter: BookPdfAdapter) {
  const firstDocument = bookDocument(book, { part: 'body', targets: true })
  if (firstDocument.issues.length > 0) throw new RenderRefusedError(`The book cannot be printed: ${firstDocument.issues.join('; ')}.`)
  let part = await inspect(await adapter.print(firstDocument.html, book, options))
  requireTargets(part, hashTargets(firstDocument))
  const plan = book.rightHandOpenings ? planBlanks(firstDocument.sections, part.destinations) : { ids: [], predicted: new Map<string, number>() }
  if (book.rightHandOpenings) {
    const finalDocument = bookDocument(book, { part: 'body', targets: true, blankBefore: plan.ids })
    part = await inspect(await adapter.print(finalDocument.html, book, options))
    requireTargets(part, hashTargets(finalDocument))
    verifyStarts('body', bodySections(firstDocument.sections), plan.predicted, part.destinations)
  }
  return { document: firstDocument, part, blankBefore: plan.ids }
}

async function printFront(book: Book, source: BookDocument, body: PrintedPart, options: RenderOptions, adapter: BookPdfAdapter) {
  const sections = frontSections(source.sections)
  if (sections.length === 0) return { part: { pages: 0, destinations: new Map() } as PrintedPart, trailingBlank: false }
  const placeholder = placeholderNumbers(book, source, body.pages)
  const provisionalDocument = bookDocument(book, { part: 'front', targets: true, crossLinks: true, pageNumbers: placeholder })
  const provisional = await inspect(await adapter.print(provisionalDocument.html, book, options))
  requireTargets(provisional, hashTargets(provisionalDocument))
  const numbers = finalNumbers(book, source.headings, provisional, body)
  const finalDocument = bookDocument(book, { part: 'front', targets: true, crossLinks: true, pageNumbers: numbers })
  const final = await inspect(await adapter.print(finalDocument.html, book, options))
  requireTargets(final, hashTargets(finalDocument))
  verifyStarts('front', sections, new Map(sections.map((section) => [section.id, provisional.destinations.get(section.id)?.page ?? 0])), final.destinations)
  const trailingBlank = book.rightHandOpenings && final.pages % 2 === 1
  return { part: trailingBlank ? await appendBlank(final) : final, trailingBlank }
}

async function join(front: PrintedPart, body: PrintedPart, marginBytes: Uint8Array): Promise<Uint8Array> {
  const output = await PDFDocument.create()
  for (const part of [front, body]) {
    if (!part.bytes) continue
    const source = await PDFDocument.load(part.bytes)
    for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page)
  }
  const layer = await PDFDocument.load(marginBytes)
  if (layer.getPageCount() !== output.getPageCount()) {
    throw new RenderRefusedError(`The margin layer has ${layer.getPageCount()} pages, but the book has ${output.getPageCount()}.`)
  }
  for (const [index, page] of layer.getPages().entries()) {
    const [embedded] = await output.embedPdf(layer, [index])
    if (embedded) output.getPage(index).drawPage(embedded, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() })
  }
  rewriteBookLinks(output, front.pages, front.destinations, body.destinations)
  return output.save()
}

export async function renderBookPdf(input: BookInput, options: RenderOptions, adapter: BookPdfAdapter): Promise<Uint8Array> {
  const book = Book.parse(input)
  if (book.mode === 'paginated') throw new RenderRefusedError('bookPdf prints continuous books; use paginated mode for a paginated book.')
  if (!book.page) throw new RenderRefusedError('Printing a continuous book needs page; set page before calling bookPdf.')
  const printedBody = await printBody(book, options, adapter)
  const printedFront = await printFront(book, printedBody.document, printedBody.part, options, adapter)
  const front = printedFront.part
  const bodyBlankPages = new Set(printedBody.blankBefore.map((id) => (printedBody.part.destinations.get(id)?.page ?? 1) - 1))
  const frontBlankPages = new Set<number>(printedFront.trailingBlank ? [front.pages] : [])
  const marginPages = [
    ...marginsFor(book, frontSections(printedBody.document.sections), front.destinations, front.pages, 0, frontBlankPages, book.numbering.frontMatter),
    ...marginsFor(
      book,
      bodySections(printedBody.document.sections),
      printedBody.part.destinations,
      printedBody.part.pages,
      front.pages,
      bodyBlankPages,
      book.numbering.body,
    ),
  ]
  const marginBytes = await adapter.print(marginDocument(book, marginPages), book, options, true)
  return adapter.finish(await join(front, printedBody.part, marginBytes), options)
}

export function bookPageCss(book: Book, marginLayer = false): string {
  if (!book.page) return ''
  const size = sheetMm(book.page)
  if (marginLayer) return `@page{size:${size.width}mm ${size.height}mm;margin:0}`
  const edge = book.page.margin
  return `@page{size:${size.width}mm ${size.height}mm;margin-top:${edge.top}mm;margin-bottom:${edge.bottom}mm}@page :right{margin-left:${edge.inner}mm;margin-right:${edge.outer}mm}@page :left{margin-left:${edge.outer}mm;margin-right:${edge.inner}mm}`
}
