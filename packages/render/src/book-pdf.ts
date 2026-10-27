import { Book, type BookInput, bookParentPages, formatNumber, resolveDirection, sheetMm } from '@segnavia/format'
import { type BookDocument, type BookHeading, type BookPageFacts, type BookSectionInfo, bookDocument, bookPrintPart, planBookPages } from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { type BookDestination, namedDestinations, rewriteBookLinks } from './book-destinations.ts'
import { marginCss, marginDocument } from './book-margins.ts'
import { RenderRefusedError } from './errors.ts'
import type { OverflowEntry, RenderOptions } from './options.ts'
import type { BookOverflowPart, PrintResult } from './overflow.ts'
import { loadPdf } from './pdf-load.ts'
import { setPdfPageSize } from './pdf-page-size.ts'

export interface BookPdfAdapter {
  print(html: string, book: Book, options: RenderOptions, part: BookOverflowPart, css?: string): Promise<PrintResult<true>>
  finish(pdf: Uint8Array, options: RenderOptions): Promise<Uint8Array>
}

interface PrintedPart {
  bytes?: Uint8Array
  overflow?: OverflowEntry
  pages: number
  destinations: Map<string, BookDestination>
}

async function inspect(output: PrintResult<true>): Promise<PrintedPart> {
  const document = await loadPdf(output.bytes)
  return { bytes: output.bytes, overflow: output.overflow, pages: document.getPageCount(), destinations: namedDestinations(document) }
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

const sectionsFor = (sections: BookSectionInfo[], part: 'front' | 'body') => sections.filter((section) => bookPrintPart(section.kind) === part)

function planBlanks(sections: BookSectionInfo[], destinations: Map<string, BookDestination>) {
  const ids: string[] = []
  const predicted = new Map<string, number>()
  let blanks = 0
  for (const section of sectionsFor(sections, 'body')) {
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
  const document = await loadPdf(part.bytes)
  const last = document.getPage(document.getPageCount() - 1)
  document.addPage([last.getWidth(), last.getHeight()])
  return { ...part, bytes: await document.save(), pages: part.pages + 1 }
}

function marginFactsFor(
  sections: BookSectionInfo[],
  destinations: Map<string, BookDestination>,
  pages: number,
  blanks: Set<number>,
  system: Book['numbering']['body'],
): BookPageFacts[] {
  const starts = sections
    .flatMap((section) => {
      const page = destinations.get(section.id)?.page
      return page === undefined ? [] : [{ page, section }]
    })
    .sort((left, right) => left.page - right.page)
  return Array.from({ length: pages }, (_, index): BookPageFacts => {
    const page = index + 1
    if (blanks.has(page)) return { blank: true, sectionOpening: false }
    const owner = starts.filter((start) => start.page <= page).at(-1)
    return {
      blank: false,
      sectionOpening: owner?.page === page,
      folio: formatNumber(page, system),
      ...(owner?.section.runningHead === undefined ? {} : { runningHead: owner.section.runningHead }),
    }
  })
}

function destinationOwner(id: string, destination: BookDestination, sections: BookSectionInfo[], destinations: Map<string, BookDestination>): string {
  const owner = sections
    .flatMap((section) => {
      const start = destinations.get(section.id)
      return start && start.page <= destination.page ? [{ section, start }] : []
    })
    .sort((left, right) => left.start.page - right.start.page)
    .at(-1)?.section
  return owner ? `${owner.title ?? owner.id} (${owner.id})` : id
}

export type FrontPrintStatus = { status: 'more' } | { status: 'stable' } | { status: 'refused'; message: string }

export function frontPrintStatus(prints: Map<string, BookDestination>[], ids: string[], sections: BookSectionInfo[]): FrontPrintStatus {
  if (prints.length < 2) return { status: 'more' }
  const expected = prints.at(-2) as Map<string, BookDestination>
  const actual = prints.at(-1) as Map<string, BookDestination>
  for (const id of ids) {
    const before = expected.get(id)
    const after = actual.get(id)
    if (!before || !after || before.page === after.page) continue
    if (prints.length < 3) return { status: 'more' }
    const owner = destinationOwner(id, before, sections, expected)
    return { status: 'refused', message: `Front destination ${id} in ${owner} moved from page ${before.page} to page ${after.page} after three prints.` }
  }
  return { status: 'stable' }
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
  let part = await inspect(await adapter.print(firstDocument.html, book, options, 'body'))
  requireTargets(part, hashTargets(firstDocument))
  const plan = book.rectoOpenings ? planBlanks(firstDocument.sections, part.destinations) : { ids: [], predicted: new Map<string, number>() }
  if (book.rectoOpenings) {
    const finalDocument = bookDocument(book, { part: 'body', targets: true, blankBefore: plan.ids })
    part = await inspect(await adapter.print(finalDocument.html, book, options, 'body'))
    requireTargets(part, hashTargets(finalDocument))
    verifyStarts('body', sectionsFor(firstDocument.sections, 'body'), plan.predicted, part.destinations)
  }
  return { document: firstDocument, part, blankBefore: plan.ids }
}

async function printFront(book: Book, source: BookDocument, body: PrintedPart, options: RenderOptions, adapter: BookPdfAdapter) {
  const sections = sectionsFor(source.sections, 'front')
  if (sections.length === 0) return { part: { pages: 0, destinations: new Map() } as PrintedPart, trailingBlank: false }
  const ids: string[] = []
  const prints: PrintedPart[] = []
  let numbers: Record<string, string> | undefined
  let final: PrintedPart | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = bookDocument(book, { part: 'front', targets: true, crossLinks: true, pageNumbers: numbers })
    const printed = await inspect(await adapter.print(document.html, book, options, 'front'))
    if (ids.length === 0) ids.push(...hashTargets(document))
    requireTargets(printed, ids)
    prints.push(printed)
    const status = frontPrintStatus(
      prints.map((part) => part.destinations),
      ids,
      sections,
    )
    if (status.status === 'stable') {
      final = printed
      break
    }
    if (status.status === 'refused') throw new RenderRefusedError(status.message)
    numbers = finalNumbers(book, source.headings, printed, body)
  }
  if (!final) throw new RenderRefusedError('The front print did not converge after three prints.')
  const trailingBlank = book.rectoOpenings && final.pages % 2 === 1
  return { part: trailingBlank ? await appendBlank(final) : final, trailingBlank }
}

async function join(front: PrintedPart, body: PrintedPart, marginBytes: Uint8Array): Promise<Uint8Array> {
  const output = await PDFDocument.create()
  for (const part of [front, body]) {
    if (!part.bytes) continue
    const source = await loadPdf(part.bytes)
    for (const page of await output.copyPages(source, source.getPageIndices())) output.addPage(page)
  }
  const layer = await loadPdf(marginBytes)
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
  if (book.mode === 'paginated') throw new RenderRefusedError('bookPdf prints continuous books; printing a paginated book is not built yet.')
  if (!book.page) throw new RenderRefusedError('Printing a continuous book needs page; set page before calling bookPdf.')
  const printedBody = await printBody(book, options, adapter)
  const printedFront = await printFront(book, printedBody.document, printedBody.part, options, adapter)
  const front = printedFront.part
  const bodyBlankPages = new Set(printedBody.blankBefore.map((id) => (printedBody.part.destinations.get(id)?.page ?? 1) - 1))
  const frontBlankPages = new Set<number>(printedFront.trailingBlank ? [front.pages] : [])
  const marginFacts = [
    ...marginFactsFor(sectionsFor(printedBody.document.sections, 'front'), front.destinations, front.pages, frontBlankPages, book.numbering.frontMatter),
    ...marginFactsFor(
      sectionsFor(printedBody.document.sections, 'body'),
      printedBody.part.destinations,
      printedBody.part.pages,
      bodyBlankPages,
      book.numbering.body,
    ),
  ]
  const direction = resolveDirection(book.dir, book.lang, book.title)
  const plan = planBookPages(marginFacts, direction)
  const parents = bookParentPages(book.page.margin)
  const margin = await adapter.print(marginDocument(book, plan, parents), book, options, 'margin', marginCss(book, plan, parents))
  const output = await adapter.finish(await setPdfPageSize(await join(front, printedBody.part, margin.bytes), sheetMm(book.page)), options)
  options.overflow?.report?.({
    entries: [front.overflow, printedBody.part.overflow, margin.overflow].filter((entry): entry is OverflowEntry => entry !== undefined),
  })
  return output
}

export function bookPageCss(book: Book, marginLayer = false): string {
  if (!book.page) return ''
  const size = sheetMm(book.page)
  if (marginLayer) return `@page{size:${size.width}mm ${size.height}mm;margin:0}`
  const edge = book.page.margin
  return `@page{size:${size.width}mm ${size.height}mm;margin-top:${edge.top}mm;margin-bottom:${edge.bottom}mm}@page :right{margin-left:${edge.inner}mm;margin-right:${edge.outer}mm}@page :left{margin-left:${edge.outer}mm;margin-right:${edge.inner}mm}`
}
