import {
  type Book,
  type BookChapterEntry,
  type BookFrontMatterEntry,
  type BookView,
  type FontReference,
  isDesignedSection,
  isTemplatedSection,
  type MotifSource,
  type Page,
  PRINTED_PAGE_CONTEXT,
  printProperties,
  type SlotsOptions,
} from '@segnavia/format'
import {
  documentLanguage,
  type ExpandedMotifs,
  expandMotifs,
  hasHostMotifPlacement,
  hasMotifPlacement,
  libraryMotifPlacementRefusal,
  MotifRefusedError,
} from '@segnavia/html'
import { frameDocument } from './bridge.ts'
import { type FontsOptions, pageFontCss } from './page-fonts.ts'
import { hasSlotWork, type PreparedSlots, prepareSlots, slotFillRefusal, slotHtml } from './slot-render.ts'

export interface MotifsOptions {
  source: MotifSource
  pins?: Record<string, string>
  linkOrigins?: Iterable<string>
  placed?(result: Pick<ExpandedMotifs, 'placed' | 'fonts' | 'unavailable'>): void
}

export interface ExpandedFramePage {
  page: Page
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

function parentRegions(page: Page): Array<{ name: string; region: 'head' | 'foot'; html: string }> {
  return (
    page.printedPages?.parents.flatMap((parent) =>
      (['head', 'foot'] as const).flatMap((region) => (parent[region] === undefined ? [] : [{ name: parent.name, region, html: parent[region] }])),
    ) ?? []
  )
}

export function framePageMotifRefusal(page: Page): MotifRefusedError | undefined {
  const regions = parentRegions(page)
  const fields = [{ html: page.html, furniture: false, replace() {} }, ...regions.map(({ html }) => ({ html, furniture: true, replace() {} }))]
  return motifSourceRefusal(fields, PAGE_MOTIF_POLICY)
}

function entryShape<T extends BookFrontMatterEntry | BookChapterEntry>(entry: T): { entry: T; fields: BookHtmlField[] } {
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
  const chapters = book.chapters.map(entryShape)
  const templates = book.templates.map((template) => ({ ...template }))
  const parentPages = book.parentPages.map((parent) => ({ ...parent }))
  return {
    book: {
      ...book,
      frontMatter: frontMatter.map(({ entry }) => entry),
      chapters: chapters.map(({ entry }) => entry),
      templates,
      parentPages,
    },
    fields: [
      ...frontMatter.flatMap(({ fields }) => fields),
      ...chapters.flatMap(({ fields }) => fields),
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

export async function expandFrameBook(book: Book, motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<ExpandedBook<Book>> {
  const shape = bookShape(book)
  if (!motifs) {
    const refusal = motifSourceRefusal(shape.fields, BOOK_MOTIF_POLICY)
    if (refusal) throw refusal
    return { book, fonts: [] }
  }
  return expandBookShape(shape, motifs, signal)
}

export async function expandFrameBookView(view: BookView, motifs: MotifsOptions, signal: AbortSignal): Promise<ExpandedBook<BookView>> {
  return expandBookShape(viewShape(view), motifs, signal)
}

export async function expandFramePage(page: Page, motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<ExpandedFramePage> {
  const regions = parentRegions(page)
  if (!motifs) {
    const refusal = framePageMotifRefusal(page)
    if (refusal) throw refusal
    return { page, fonts: [] }
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
  return { page: { ...page, html: result.html, ...(printedPages ? { printedPages } : {}) }, fonts: summary.fonts }
}

export function expandFramePages(pages: Page[], motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<ExpandedFramePage[]> {
  return Promise.all(pages.map((page) => expandFramePage(page, motifs, signal)))
}

export async function prepareShownPage(
  page: Page,
  motifs: MotifsOptions | undefined,
  slots: SlotsOptions | undefined,
  fonts: FontsOptions | undefined,
  signal: AbortSignal,
): Promise<{ page: Page; resolved?: PreparedSlots; css: string }> {
  const expanded = await expandFramePage(page, motifs, signal)
  const refusal = slotFillRefusal(expanded.page.scripts, expanded.page.slots, slots)
  if (refusal) throw refusal
  const resolved = hasSlotWork(expanded.page.slots, slots) ? await prepareSlots(expanded.page.slots, slots, signal) : undefined
  const css = await pageFontCss(expanded.page, expanded.fonts, fonts, signal)
  return { page: expanded.page, resolved, css }
}

export function shownPageDocument(page: Page, resolved: PreparedSlots | undefined, options: { nonce: string; css?: string; csp?: string }): string {
  return frameDocument(slotHtml(page.html, resolved), {
    scripts: page.scripts,
    nonce: options.nonce,
    dir: page.dir,
    lang: page.lang,
    css: `${page.print ? printProperties(page.print) : ''}${options.css ?? ''}`,
    csp: options.csp,
    relayKeys: false,
  })
}
