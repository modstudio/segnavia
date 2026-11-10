import {
  type AsOfDay,
  type Book,
  type BookItem,
  type BookView,
  bookFromDocument,
  type DocumentInput,
  type FontReference,
  isDesignedSection,
  isPart,
  isTemplatedSection,
  type PageWidths,
  type PreflightEntry,
  type PreflightProfile,
  RECORD_CONTEXT,
  resolveBrand,
} from '@segnavia/format'
import {
  documentLanguage,
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
import type { BrandsOptions } from './brands.ts'
import {
  expandedPageParents,
  expandPageMotifs,
  type MotifsOptions,
  motifSummary,
  PARENT_MOTIF_SOURCE_REFUSAL,
  pageMotifRefusal,
  pageParentRegions,
} from './page-motif-expansion.ts'
import { bookPlacementWidth, type PlacementPreflight, placementReportWithPreflight, resolvePagePlacements } from './placement-resolution.ts'

export type { ResolvedPlacement, ResolvePlacement } from '@segnavia/html'
export type { MotifsOptions } from './page-motif-expansion.ts'
export { type ExpandedPrintedFramePage, expandPrintedFramePage } from './printed-page-expansion.ts'
export type PlacementsOptions = AssetPlacementsOptions
export interface ExpandedFramePage {
  page: HtmlPage
  fonts: FontReference[]
  preflight?: PreflightEntry[]
}
export interface ExpandedBook<T extends Book | BookView> {
  book: T
  fonts: FontReference[]
  preflight?: PreflightEntry[]
}
interface BookHtmlField {
  html: string
  furniture: boolean
  pageGeometry?: string
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

const BOOK_MOTIF_POLICY: MotifPolicy = {
  placement: (html, furniture) => (furniture ? hasHostMotifPlacement(html) : hasMotifPlacement(html)),
  libraryRefusal: (html, furniture) => libraryMotifPlacementRefusal(html, furniture),
}

function motifSourceRefusal(fields: BookHtmlField[], policy: MotifPolicy): MotifRefusedError | undefined {
  for (const field of fields) {
    const refusal = policy.libraryRefusal(field.html, field.furniture)
    if (refusal) return new MotifRefusedError(refusal)
  }
  if (fields.some((field) => field.furniture && policy.placement(field.html, field.furniture))) {
    return new MotifRefusedError(PARENT_MOTIF_SOURCE_REFUSAL)
  }
  return undefined
}

export function framePageMotifRefusal(page: HtmlPage): MotifRefusedError | undefined {
  return pageMotifRefusal([page.html], pageParentRegions(page))
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
    return {
      entry: copy,
      fields: copy.pages.map((page) => ({ html: page.html, furniture: false, pageGeometry: copy.pageGeometry, replace: (html) => (page.html = html) })),
    }
  }
  if (isTemplatedSection(entry)) {
    const copy = { ...entry, pages: entry.pages.map((page) => ({ ...page, regions: { ...page.regions } })) }
    return {
      entry: copy,
      fields: copy.pages.flatMap((page) =>
        Object.keys(page.regions).map((name) => ({
          html: page.regions[name] as string,
          furniture: false,
          pageGeometry: copy.pageGeometry,
          replace: (html: string) => (page.regions[name] = html),
        })),
      ),
    }
  }
  if ('html' in entry) {
    const copy = { ...entry }
    return {
      entry: copy,
      fields: [
        {
          html: copy.html as string,
          furniture: false,
          ...('pageGeometry' in copy ? { pageGeometry: copy.pageGeometry } : {}),
          replace: (html) => (copy.html = html),
        },
      ],
    }
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
  const deferred = field.furniture ? { deferPaths: [RECORD_CONTEXT], deferLibrary: true } : {}
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
  preflight?: PlacementPreflight,
): Promise<ExpandedBook<T>> {
  if (!placements) return expanded
  const shape = 'frontMatter' in expanded.book ? bookShape(expanded.book as Book) : viewShape(expanded.book as BookView)
  const resolved = await Promise.all(
    shape.fields.map((field) =>
      resolvePlacements(field.html, {
        resolvePlacement: placements.resolve,
        report: placementReportWithPreflight(placements.report, preflight),
        purpose,
        width: bookPlacementWidth(shape.book, field.pageGeometry, pageWidths),
        signal,
      }),
    ),
  )
  resolved.forEach((html, index) => {
    shape.fields[index]?.replace(html)
  })
  return { book: shape.book, fonts: expanded.fonts, preflight: expanded.preflight ?? [] } as ExpandedBook<T>
}

export async function expandFrameBook(
  input: DocumentInput,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
  brands?: BrandsOptions,
  profile?: PreflightProfile,
): Promise<ExpandedBook<Book>> {
  const document = parseDocument(input)
  return expandFrameBookValue(
    bookFromDocument(document, await resolveBrand(document, brands?.source, signal)),
    motifs,
    signal,
    placements,
    purpose,
    pageWidths,
    profile,
  )
}

export async function expandFrameBookValue(
  book: Book,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
  profile?: PreflightProfile,
): Promise<ExpandedBook<Book>> {
  const preflight = profile ? { profile, entries: [] as PreflightEntry[] } : undefined
  const placementOptions = placements ? { ...placements, report: placementReportWithPreflight(placements.report, preflight) } : placements
  const entriesResolved = await resolveBookEntries(book, placementOptions, purpose, signal)
  const shape = bookShape(entriesResolved)
  if (!motifs) {
    const refusal = motifSourceRefusal(shape.fields, BOOK_MOTIF_POLICY)
    if (refusal) throw refusal
    return resolveBookShape({ book: entriesResolved, fonts: [], preflight: preflight?.entries ?? [] }, placements, purpose, signal, pageWidths, preflight)
  }
  const expanded = await expandBookShape(shape, motifs, signal)
  return resolveBookShape({ ...expanded, preflight: preflight?.entries ?? [] }, placements, purpose, signal, pageWidths, preflight)
}

export async function expandFrameBookView(
  view: BookView,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  pageWidths?: PageWidths,
  profile?: PreflightProfile,
): Promise<ExpandedBook<BookView>> {
  const preflight = profile ? { profile, entries: [] as PreflightEntry[] } : undefined
  const expanded = motifs ? await expandBookShape(viewShape(view), motifs, signal) : { book: view, fonts: [] }
  return resolveBookShape({ ...expanded, preflight: preflight?.entries ?? [] }, placements, 'screen', signal, pageWidths, preflight)
}

export async function expandFramePage(
  page: HtmlPage,
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
  day?: AsOfDay,
  profile?: PreflightProfile,
): Promise<ExpandedFramePage> {
  const preflight = profile ? { profile, entries: [] as PreflightEntry[] } : undefined
  const regions = pageParentRegions(page)
  if (!motifs) {
    const refusal = framePageMotifRefusal(page)
    if (refusal) throw refusal
    return { page: await resolvePagePlacements(page, placements, purpose, signal, pageWidths, day, preflight), fonts: [], preflight: preflight?.entries ?? [] }
  }
  const lang = page.lang?.trim() || documentLanguage(page.html)
  const { bodyResults, parentResults, fonts } = await expandPageMotifs(page, [{ html: page.html, lang }], regions, lang, motifs, signal, day)
  const result = bodyResults[0]
  if (!result) throw new Error('A page motif expansion produced no body result.')
  const printedPages = page.printedPages
    ? {
        ...page.printedPages,
        parents: expandedPageParents(page, parentResults),
      }
    : undefined
  const expandedPage = { ...page, html: result.html, ...(printedPages ? { printedPages } : {}) }
  return {
    page: await resolvePagePlacements(expandedPage, placements, purpose, signal, pageWidths, day, preflight),
    fonts,
    preflight: preflight?.entries ?? [],
  }
}

export function expandFramePages(
  pages: HtmlPage[],
  motifs: MotifsOptions | undefined,
  signal: AbortSignal,
  placements?: PlacementsOptions,
  purpose: 'screen' | 'print' = 'screen',
  pageWidths?: PageWidths,
  days?: readonly (AsOfDay | undefined)[],
): Promise<ExpandedFramePage[]> {
  return Promise.all(pages.map((page, index) => expandFramePage(page, motifs, signal, placements, purpose, pageWidths, days?.[index])))
}
