import { type Book, bookParentPages, physicalMargins, pressBoxes, resolveDirection, sequenceFolios, sheetMm, usesPressLayout } from '@segnavia/format'
import type { PreparedSlots } from '@segnavia/html'
import {
  type BookDocument,
  type BookHeading,
  type BookPageFacts,
  type BookSectionInfo,
  bookDocument,
  bookPrintPart,
  PAGE_REFERENCE_ATTRIBUTE,
  PAGE_REFERENCE_VALUE,
  planBookPages,
} from '@segnavia/html'
import { PDFDocument } from 'pdf-lib'
import { type BookDestination, joinedDestinations, namedDestinations, rewriteBookLinks } from './book-destinations.ts'
import { marginCss, marginDocument } from './book-margins.ts'
import type { BookPdfAdapter, PrintedPart } from './book-pdf-types.ts'
import { bookPartsPrintStatus, finalNumbers, folioTextAt, frontPrintStatus, pageReferencePrintStatus } from './book-print-status.ts'
import { writeBookStructure } from './book-structure.ts'
import { RenderRefusedError } from './errors.ts'
import type { OverflowEntry } from './options.ts'
import type { PrintResult } from './overflow.ts'
import { addPressBoxes } from './page-paper.ts'
import { loadPdf } from './pdf-load.ts'
import { setPdfPageSize } from './pdf-page-size.ts'
import type { BookPdfOptions } from './renderer.ts'
import { slotsForDocument } from './slot-document.ts'
import { bookSlotFrames, filledBook } from './slot-fill.ts'

export type { BookPdfAdapter } from './book-pdf-types.ts'

async function inspect(output: PrintResult<true>): Promise<PrintedPart> {
  const document = await loadPdf(output.bytes)
  return { bytes: output.bytes, overflow: output.overflow, pages: document.getPageCount(), destinations: namedDestinations(document) }
}

function hashTargets(document: BookDocument): string[] {
  const hidden = /<div class="segnavia-targets"[^>]*>([\s\S]*?)<\/div>/.exec(document.html)?.[1] ?? ''
  return [...new Set([...hidden.matchAll(/href="#([^"]+)"/g)].map((match) => match[1] as string))]
}

const pageReferencePattern = new RegExp(`<a\\b[^>]*\\b${PAGE_REFERENCE_ATTRIBUTE}="${PAGE_REFERENCE_VALUE}"`)
const hasPageReferences = (document: BookDocument) => pageReferencePattern.test(document.html)

function requireTargets(part: PrintedPart, expected: string[]): void {
  const missing = expected.filter((id) => !part.destinations.has(id))
  if (missing.length > 0) {
    throw new RenderRefusedError(
      `Chromium wrote ${expected.length - missing.length} of ${expected.length} named destinations for hidden targets; missing ${missing.join(', ')}.`,
    )
  }
}

const sectionsFor = (sections: BookSectionInfo[], part: 'front' | 'body') => sections.filter((section) => bookPrintPart(section.division) === part)

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
  const folios = sequenceFolios(pages, system)
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
      folio: folioTextAt(folios, page),
      ...(owner?.section.runningHead === undefined ? {} : { runningHead: owner.section.runningHead }),
    }
  })
}

async function printBody(book: Book, slots: PreparedSlots, options: BookPdfOptions, adapter: BookPdfAdapter) {
  const firstDocument = bookDocument(book, { part: 'body', targets: true })
  if (firstDocument.issues.length > 0) throw new RenderRefusedError(`The book cannot be printed: ${firstDocument.issues.join('; ')}.`)
  let part = await inspect(await adapter.print(firstDocument.html, book, slots, options, 'body'))
  requireTargets(part, hashTargets(firstDocument))
  const plan = book.rectoOpenings ? planBlanks(firstDocument.sections, part.destinations) : { ids: [], predicted: new Map<string, number>() }
  if (book.rectoOpenings) {
    const finalDocument = bookDocument(book, { part: 'body', targets: true, blankBefore: plan.ids })
    part = await inspect(await adapter.print(finalDocument.html, book, slots, options, 'body'))
    requireTargets(part, hashTargets(finalDocument))
    verifyStarts('body', sectionsFor(firstDocument.sections, 'body'), plan.predicted, part.destinations)
  }
  return { document: firstDocument, part, blankBefore: plan.ids, predicted: plan.predicted }
}

async function convergeBody(
  book: Book,
  slots: PreparedSlots,
  source: Awaited<ReturnType<typeof printBody>>,
  front: PrintedPart,
  options: BookPdfOptions,
  adapter: BookPdfAdapter,
) {
  const ids = source.document.pageReferenceTargets
  if (ids.length === 0) return source.part
  let part = source.part
  let expected = finalNumbers(ids, [
    { destinations: front.destinations, system: book.numbering.frontMatter },
    { destinations: part.destinations, system: book.numbering.body },
  ])
  for (let reprints = 1; reprints <= 3; reprints += 1) {
    const document = bookDocument(book, { part: 'body', targets: true, crossLinks: true, blankBefore: source.blankBefore, pageNumbers: expected })
    const printed = await inspect(await adapter.print(document.html, book, slots, options, 'body'))
    requireTargets(printed, hashTargets(document))
    const actual = finalNumbers(ids, [
      { destinations: front.destinations, system: book.numbering.frontMatter },
      { destinations: printed.destinations, system: book.numbering.body },
    ])
    part = printed
    const status = pageReferencePrintStatus(expected, actual, reprints)
    if (status.status === 'stable') {
      if (book.rectoOpenings) verifyStarts('body', sectionsFor(source.document.sections, 'body'), source.predicted, part.destinations)
      return part
    }
    if (status.status === 'refused') throw new RenderRefusedError(status.message)
    expected = actual
  }
  return part
}

async function printFront(book: Book, slots: PreparedSlots, source: BookDocument, body: PrintedPart, options: BookPdfOptions, adapter: BookPdfAdapter) {
  const sections = sectionsFor(source.sections, 'front')
  const headingIds = new Set(source.headings.map((heading) => heading.id))
  const numberIds = [...new Set([...headingIds, ...source.pageReferenceTargets])]
  if (sections.length === 0) {
    const part = { pages: 0, destinations: new Map() } as PrintedPart
    const numbers = finalNumbers(numberIds, [{ destinations: body.destinations, system: book.numbering.body }], headingIds)
    return { part, trailingBlank: false, numbers }
  }
  const ids: string[] = []
  const prints: PrintedPart[] = []
  let numbers: Record<string, string> | undefined
  let final: PrintedPart | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const document = bookDocument(book, { part: 'front', targets: true, crossLinks: true, pageNumbers: numbers })
    const printed = await inspect(await adapter.print(document.html, book, slots, options, 'front'))
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
    numbers = finalNumbers(
      numberIds,
      [
        { destinations: printed.destinations, system: book.numbering.frontMatter },
        { destinations: body.destinations, system: book.numbering.body },
      ],
      headingIds,
    )
  }
  if (!final) throw new RenderRefusedError('The front print did not converge after three prints.')
  const trailingBlank = book.rectoOpenings && final.pages % 2 === 1
  numbers = finalNumbers(
    numberIds,
    [
      { destinations: final.destinations, system: book.numbering.frontMatter },
      { destinations: body.destinations, system: book.numbering.body },
    ],
    headingIds,
  )
  return { part: trailingBlank ? await appendBlank(final) : final, trailingBlank, numbers }
}

async function convergeBookParts(
  book: Book,
  frontSlots: PreparedSlots,
  bodySlots: PreparedSlots,
  body: Awaited<ReturnType<typeof printBody>>,
  options: BookPdfOptions,
  adapter: BookPdfAdapter,
) {
  if (!hasPageReferences(body.document)) {
    return { front: await printFront(book, frontSlots, body.document, body.part, options, adapter), body: body.part }
  }
  for (let alternations = 1; alternations <= 3; alternations += 1) {
    const front = await printFront(book, frontSlots, body.document, body.part, options, adapter)
    body.part = await convergeBody(book, bodySlots, body, front.part, options, adapter)
    const actual = finalNumbers(
      [...new Set([...body.document.headings.map((heading) => heading.id), ...body.document.pageReferenceTargets])],
      [
        { destinations: front.part.destinations, system: book.numbering.frontMatter },
        { destinations: body.part.destinations, system: book.numbering.body },
      ],
      new Set(body.document.headings.map((heading) => heading.id)),
    )
    const status = bookPartsPrintStatus(front.numbers, actual, alternations)
    if (status.status === 'stable') return { front, body: body.part }
    if (status.status === 'refused') throw new RenderRefusedError(status.message)
  }
  throw new RenderRefusedError('The front and body page references did not converge after three alternations.')
}

async function join(book: Book, headings: BookHeading[], front: PrintedPart, body: PrintedPart, marginBytes: Uint8Array): Promise<Uint8Array> {
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
  writeBookStructure(output, { book, headings, destinations: joinedDestinations(front, body) })
  return output.save()
}

async function renderPaginatedBookPdf(book: Book, slots: PreparedSlots, options: BookPdfOptions, adapter: BookPdfAdapter): Promise<Uint8Array> {
  if (!book.page) throw new RenderRefusedError('Printing a paginated book needs page; set page before calling bookPdf.')
  const printed = await inspect(await adapter.print('', book, slots, options, 'body'))
  if (!printed.bytes) throw new RenderRefusedError('The paginated book print produced no bytes.')
  const document = await loadPdf(printed.bytes)
  rewriteBookLinks(document, 0, new Map(), printed.destinations)
  const built = bookDocument(book)
  if (built.issues.length > 0) throw new RenderRefusedError(`The book cannot be printed: ${built.issues.join('; ')}.`)
  writeBookStructure(document, { book, headings: built.headings, destinations: printed.destinations })
  let bytes = await setPdfPageSize(await document.save(), sheetMm(book.page))
  if (book.print && usesPressLayout(book.print)) bytes = await addPressBoxes(bytes, pressBoxes(sheetMm(book.page), book.print), book.print.markColor, 'trim')
  const output = await adapter.finish(bytes, options)
  options.overflow?.report?.({ entries: printed.overflow ? [printed.overflow] : [] })
  return output
}

export async function renderBookPdf(input: Book, options: BookPdfOptions, adapter: BookPdfAdapter): Promise<Uint8Array> {
  const { value: book, slots } = await filledBook(input, options.slots)
  const frames = bookSlotFrames(book)
  if (book.mode === 'paginated') return renderPaginatedBookPdf(book, slotsForDocument(slots, [frames.all]), options, adapter)
  if (!book.page) throw new RenderRefusedError('Printing a continuous book needs page; set page before calling bookPdf.')
  const bodySlots = slotsForDocument(slots, [frames.body])
  const frontSlots = slotsForDocument(slots, [frames.front])
  const printedBody = await printBody(book, bodySlots, options, adapter)
  const converged = await convergeBookParts(book, frontSlots, bodySlots, printedBody, options, adapter)
  const printedFront = converged.front
  printedBody.part = converged.body
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
  const margin = await adapter.print(marginDocument(book, plan, parents), book, slotsForDocument(slots, []), options, 'margin', marginCss(book, plan, parents))
  let bytes = await setPdfPageSize(await join(book, printedBody.document.headings, front, printedBody.part, margin.bytes), sheetMm(book.page))
  if (book.print && usesPressLayout(book.print)) bytes = await addPressBoxes(bytes, pressBoxes(sheetMm(book.page), book.print), book.print.markColor, 'trim')
  const output = await adapter.finish(bytes, options)
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
  const right = physicalMargins(edge, 'ltr', 'recto')
  const left = physicalMargins(edge, 'ltr', 'verso')
  return `@page{size:${size.width}mm ${size.height}mm;margin-top:${right.top}mm;margin-bottom:${right.bottom}mm}@page :right{margin-left:${right.left}mm;margin-right:${right.right}mm}@page :left{margin-left:${left.left}mm;margin-right:${left.right}mm}`
}
