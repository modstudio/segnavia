import {
  type Book,
  type BookItem,
  type BookView,
  bookFromDocument,
  type DocumentInput,
  type FontReference,
  isDesignedSection,
  isPart,
  isTemplatedSection,
  type MotifSource,
  type PageWidths,
  PRINTED_PAGE_CONTEXT,
  type SlotsOptions,
} from '@segnavia/format'
import {
  documentLanguage,
  type ExpandedMotifs,
  expandMotifs,
  type HtmlPage,
  hasHostMotifPlacement,
  hasMotifPlacement,
  libraryMotifPlacementRefusal,
  MotifRefusedError,
  parseDocument,
  resolvePlacements,
} from '@segnavia/html'
import type { AssetPlacementsOptions } from './board-policy.ts'
import { resolveBookEntries } from './book-entry-resolution.ts'
import { type FontsOptions, pageFontCss } from './page-fonts.ts'
import { bookPlacementWidth, resolvePagePlacements } from './placement-resolution.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal } from './slot-render.ts'

export interface MotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  linkOrigins?: Iterable<string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}
export type { ResolvedPlacement, ResolvePlacement } from '@segnavia/html'
export type PlacementsOptions = AssetPlacementsOptions
export interface ExpandedFramePage {
  page: HtmlPage
  fonts: FontReference[]
}
export interface ExpandedBook<T extends Book | BookView> {
  book: T
  fonts: FontReference[]
}
interface BookHtmlField {
  html: string
  furniture: boolean
  replace(html: string): void
}

interface BookHtmlShape<T extends Book | BookView> {
  book: T
  fields: BookHtmlField[]
}

interface MotifPolicy {
  placement(html: string, furniture: boolean): boolean
  libraryRefusal(html: string, furniture: boolean): string | undefined
}

const PAGE_MOTIF_POLICY: MotifPolicy = {
  placement: (html) => hasMotifPlacement(html),
  libraryRefusal: (html) => libraryMotifPlacementRefusal(html),
}

const BOOK_MOTIF_POLICY: MotifPolicy = {
  placement: (html, furniture) => (furniture ? hasHostMotifPlacement(html) : hasMotifPlacement(html)),
  libraryRefusal: (html, furniture) => (furniture ? undefined : libraryMotifPlacementRefusal(html)),
}

function motifSourceRefusal(fields: BookHtmlField[], policy: MotifPolicy): MotifRefusedError | undefined {
  for (const field of fields) {
    const refusal = policy.libraryRefusal(field.html, field.furniture)
    if (refusal) return new MotifRefusedError(refusal)
  }
  if (fields.some((field) => field.furniture && policy.placement(field.html, field.furniture))) {
    return new MotifRefusedError('A parent-page motif placement could not establish its motif source; provide motifs.source to clear this refusal.')
  }
  return undefined
}

function parentRegions(page: HtmlPage): Array<{ name: string; region: 'head' | 'foot'; html: string }> {
  return (
    page.printedPages?.parents.flatMap((parent) =>
      (['head', 'foot'] as const).flatMap((region) => (parent[region] === undefined ? [] : [{ name: parent.name, region, html: parent[region] }])),
    ) ?? []
  )
}

export function framePageMotifRefusal(page: HtmlPage): MotifRefusedError | undefined {
  const regions = parentRegions(page)
  const fields = [{ html: page.html, furniture: false, replace() {} }, ...regions.map(({ html }) => ({ html, furniture: true, replace() {} }))]
  return motifSourceRefusal(fields, PAGE_MOTIF_POLICY)
}

function entryShape(entry: BookItem): { entry: BookItem; fields: BookHtmlField[] } {
  if (isPart(entry)) {
    const children = entry.children.map(entryShape)
    const copy = { ...entry, children: children.map(({ entry: child }) => child) }
    return {
      entry: copy,
      fields: [
        ...(copy.html === undefined ? [] : [{ html: copy.html, furniture: false, replace: (html: string) => (copy.html = html) }]),
        ...children.flatMap(({ fields }) => fields),
      ],
    }
  }
  if (isDesignedSection(entry)) {
    const copy = { ...entry, pages: entry.pages.map((page) => ({ ...page })) }
    return { entry: copy, fields: copy.pages.map((page) => ({ html: page.html, furniture: false, replace: (html) => (page.html = html) })) }
  }
  if (isTemplatedSection(entry)) {
    const copy = { ...entry, pages: entry.pages.map((page) => ({ ...page, regions: { ...page.regions } })) }
    return {
      entry: copy,
      fields: copy.pages.flatMap((page) =>
        Object.keys(page.regions).map((name) => ({
          html: page.regions[name] as string,
          furniture: false,
          replace: (html: string) => (page.regions[name] = html),
        })),
      ),
    }
  }
  if ('html' in entry) {
    const copy = { ...entry }
    return { entry: copy, fields: [{ html: copy.html as string, furniture: false, replace: (html) => (copy.html = html) }] }
  }
  return { entry, fields: [] }
}

function bookShape(book: Book): BookHtmlShape<Book> {
  const frontMatter = book.frontMatter.map(entryShape)
  const body = book.body.map(entryShape)
  const endMatter = book.endMatter.map(entryShape)
  const templates = book.templates.map((template) => ({ ...template }))
  const parentPages = book.parentPages.map((parent) => ({ ...parent }))
  return {
    book: {
      ...book,
      frontMatter: frontMatter.map(({ entry }) => entry),
      body: body.map(({ entry }) => entry),
      endMatter: endMatter.map(({ entry }) => entry),
      templates,
      parentPages,
    },
    fields: [
      ...frontMatter.flatMap(({ fields }) => fields),
      ...body.flatMap(({ fields }) => fields),
      ...endMatter.flatMap(({ fields }) => fields),
      ...templates.map((template) => ({ html: template.html, furniture: false, replace: (html: string) => (template.html = html) })),
      ...parentPages.flatMap((parent) =>
        (['head', 'foot'] as const).flatMap((region) => {
          const html = parent[region]
          return html === undefined ? [] : [{ html, furniture: true, replace: (expanded: string) => (parent[region] = expanded) }]
        }),
      ),
    ],
  }
}

function viewShape(view: BookView): BookHtmlShape<BookView> {
  const book = {
    ...view,
    pagination: view.pagination ? { ...view.pagination, parents: view.pagination.parents.map((parent) => ({ ...parent })) } : undefined,
  }
  return {
    book,
    fields: [
      { html: book.html, furniture: false, replace: (html) => (book.html = html) },
      ...(book.flow === undefined ? [] : [{ html: book.flow, furniture: false, replace: (html: string) => (book.flow = html) }]),
      ...(book.pagination?.parents.flatMap((parent) =>
        (['head', 'foot'] as const).flatMap((region) => {
          const html = parent[region]
          return html === undefined ? [] : [{ html, furniture: true, replace: (expanded: string) => (parent[region] = expanded) }]
        }),
      ) ?? []),
    ],
  }
}

export function bookMotifRefusal(book: Book): MotifRefusedError | undefined {
  return motifSourceRefusal(bookShape(book).fields, BOOK_MOTIF_POLICY)
}

export function bookViewMotifRefusal(view: BookView): MotifRefusedError | undefined {
  return motifSourceRefusal(viewShape(view).fields, BOOK_MOTIF_POLICY)
}

async function expandBookHtml(field: BookHtmlField, lang: string | undefined, scripts: Book['scripts'], motifs: MotifsOptions, signal: AbortSignal) {
  const deferred = field.furniture ? { deferPaths: [PRINTED_PAGE_CONTEXT], deferLibrary: true } : {}
  return expandMotifs(field.html, {
    source: motifs.source,
    pins: motifs.pins,
    lang,
    scripts,
    prefix: 'slot',
    linkOrigins: motifs.linkOrigins,
    signal,
    ...deferred,
  })
}

function motifSummary(results: ExpandedMotifs[]) {
  return {
    placed: results.flatMap((result) => result.placed),
    fonts: results.flatMap((result) => result.fonts),
    unavailable: [...new Set(results.flatMap((result) => result.unavailable))],
  }
}

async function expandBookShape<T extends Book | BookView>(shape: BookHtmlShape<T>, motifs: MotifsOptions, signal: AbortSignal): Promise<ExpandedBook<T>> {
  const results = await Promise.all(shape.fields.map((field) => expandBookHtml(field, shape.book.lang, shape.book.scripts, motifs, signal)))
  results.forEach((result, index) => {
    shape.fields[index]?.replace(result.html)
  })
  const summary = motifSummary(results)
  motifs.placed?.(summary)
  return { book: shape.book, fonts: summary.fonts }
}

async function resolveBookShape<T extends Book | BookView>(
  expanded: ExpandedBook<T>,
  placements: PlacementsOptions | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
  pageWidths?: PageWidths,
): Promise<ExpandedBook<T>> {
  if (!placements) return expanded
  const shape = 'frontMatter' in expanded.book ? bookShape(expanded.book as Book) : viewShape(expanded.book as BookView)
  const resolved = await Promise.all(
    shape.fields.map((field) =>
      resolvePlacements(field.html, {
        resolvePlacement: placements.resolve,
        report: placements.report,
        purpose,
        width: bookPlacementWidth(shape.book, pageWidths),
        signal,
      }),
    ),
  )
  resolved.forEach((html, index) => {
    shape.fields[index]?.replace(html)
  })
  return { book: shape.book, fonts: expanded.fonts } as ExpandedBook<T>
}

export async function expandFrameBook(
  input: DocumentInput,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
): Promise<ExpandedBook<Book>> {
  return expandFrameBookValue(bookFromDocument(parseDocument(input)), motifs, signal, placements, purpose, pageWidths)
}

export async function expandFrameBookValue(
  book: Book,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
): Promise<ExpandedBook<Book>> {
  const entriesResolved = await resolveBookEntries(book, placements, purpose, signal)
  const shape = bookShape(entriesResolved)
  if (!motifs) {
    const refusal = motifSourceRefusal(shape.fields, BOOK_MOTIF_POLICY)
    if (refusal) throw refusal
    return resolveBookShape({ book: entriesResolved, fonts: [] }, placements, purpose, signal, pageWidths)
  }
  return resolveBookShape(await expandBookShape(shape, motifs, signal), placements, purpose, signal, pageWidths)
}

export async function expandFrameBookView(
  view: BookView,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
): Promise<ExpandedBook<BookView>> {
  const expanded = motifs ? await expandBookShape(viewShape(view), motifs, signal) : { book: view, fonts: [] }
  return resolveBookShape(expanded, placements, 'screen', signal, pageWidths)
}

export async function expandFramePage(
  page: HtmlPage,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
): Promise<ExpandedFramePage> {
  const regions = parentRegions(page)
  if (!motifs) {
    const refusal = framePageMotifRefusal(page)
    if (refusal) throw refusal
    return { page: await resolvePagePlacements(page, placements, purpose, signal, pageWidths), fonts: [] }
  }
  const lang = page.lang?.trim() || documentLanguage(page.html)
  const result = await expandMotifs(page.html, {
    source: motifs.source,
    pins: motifs.pins,
    lang,
    scripts: page.scripts,
    prefix: 'slot',
    linkOrigins: motifs.linkOrigins,
    signal,
  })
  const parentResults = new Map(
    await Promise.all(
      regions.map(
        async ({ name, region, html }) =>
          [
            `${name}:${region}`,
            await expandMotifs(html, {
              source: motifs.source,
              pins: motifs.pins,
              lang,
              scripts: page.scripts,
              prefix: 'slot',
              linkOrigins: motifs.linkOrigins,
              signal,
              deferPaths: [PRINTED_PAGE_CONTEXT],
            }),
          ] as const,
      ),
    ),
  )
  signal.throwIfAborted()
  const summary = motifSummary([result, ...parentResults.values()])
  motifs.placed?.(summary)
  const printedPages = page.printedPages
    ? {
        ...page.printedPages,
        parents: page.printedPages.parents.map((parent) => ({
          ...parent,
          ...(parent.head === undefined ? {} : { head: parentResults.get(`${parent.name}:head`)?.html ?? parent.head }),
          ...(parent.foot === undefined ? {} : { foot: parentResults.get(`${parent.name}:foot`)?.html ?? parent.foot }),
        })),
      }
    : undefined
  const expandedPage = { ...page, html: result.html, ...(printedPages ? { printedPages } : {}) }
  return { page: await resolvePagePlacements(expandedPage, placements, purpose, signal, pageWidths), fonts: summary.fonts }
}

export function expandFramePages(
  pages: HtmlPage[],
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
): Promise<ExpandedFramePage[]> {
  return Promise.all(pages.map((page) => expandFramePage(page, motifs, signal, placements, purpose, pageWidths)))
}

export async function prepareShownPage(
  page: HtmlPage,
  motifs: MotifsOptions | undefined,
  slots: SlotsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
): Promise<{ page: HtmlPage; resolved?: PreparedSlots; css: string }> {
  const expanded = await expandFramePage(page, motifs, signal, placements, 'screen', pageWidths)
  const refusal = slotFillRefusal(expanded.page.scripts, expanded.page.slots, slots)
  if (refusal) throw refusal
  const resolved = hasSlotWork(expanded.page.slots, slots) ? await prepareSlots(expanded.page.slots, slots, signal) : undefined
  const css = await pageFontCss(expanded.page, expanded.fonts, fonts, signal)
  return { page: expanded.page, resolved, css }
}
