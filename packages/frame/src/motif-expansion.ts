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
import { documentLanguage, type ExpandedMotifs, expandMotifs, hasMotifPlacement, libraryMotifPlacementRefusal, MotifRefusedError } from '@segnavia/html'
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
}

function motifSourceRefusal(fields: BookHtmlField[]): MotifRefusedError | undefined {
  for (const { html } of fields) {
    const refusal = libraryMotifPlacementRefusal(html)
    if (refusal) return new MotifRefusedError(refusal)
  }
  if (fields.some(({ html, furniture }) => furniture && hasMotifPlacement(html))) {
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
  return motifSourceRefusal([{ html: page.html, furniture: false }, ...regions.map(({ html }) => ({ html, furniture: true }))])
}

function entryFields(entry: BookFrontMatterEntry | BookChapterEntry): string[] {
  if (isDesignedSection(entry)) return entry.pages.map((page) => page.html)
  if (isTemplatedSection(entry)) return entry.pages.flatMap((page) => Object.values(page.regions))
  return 'html' in entry ? [entry.html] : []
}

function bookFields(book: Book): BookHtmlField[] {
  return [
    ...book.frontMatter.flatMap(entryFields).map((html) => ({ html, furniture: false })),
    ...book.chapters.flatMap(entryFields).map((html) => ({ html, furniture: false })),
    ...book.templates.map(({ html }) => ({ html, furniture: false })),
    ...book.parentPages.flatMap((parent) => [parent.head, parent.foot].flatMap((html) => (html === undefined ? [] : [{ html, furniture: true }]))),
  ]
}

function viewFields(view: BookView): BookHtmlField[] {
  return [
    { html: view.html, furniture: false },
    ...(view.flow === undefined ? [] : [{ html: view.flow, furniture: false }]),
    ...(view.pagination?.parents.flatMap((parent) => [parent.head, parent.foot].flatMap((html) => (html === undefined ? [] : [{ html, furniture: true }]))) ??
      []),
  ]
}

export function bookMotifRefusal(book: Book): MotifRefusedError | undefined {
  return motifSourceRefusal(bookFields(book))
}

export function bookViewMotifRefusal(view: BookView): MotifRefusedError | undefined {
  return motifSourceRefusal(viewFields(view))
}

async function expandBookHtml(
  html: string,
  furniture: boolean,
  lang: string | undefined,
  scripts: Book['scripts'],
  motifs: MotifsOptions,
  signal: AbortSignal,
) {
  return expandMotifs(html, {
    source: motifs.source,
    pins: motifs.pins,
    lang,
    scripts,
    prefix: 'slot',
    linkOrigins: motifs.linkOrigins,
    signal,
    ...(furniture ? { deferPaths: [PRINTED_PAGE_CONTEXT] } : {}),
  })
}

function motifSummary(results: ExpandedMotifs[]) {
  return {
    placed: results.flatMap((result) => result.placed),
    fonts: results.flatMap((result) => result.fonts),
    unavailable: [...new Set(results.flatMap((result) => result.unavailable))],
  }
}

async function expandEntry<T extends BookFrontMatterEntry | BookChapterEntry>(
  entry: T,
  expand: (html: string) => Promise<ExpandedMotifs>,
  results: ExpandedMotifs[],
): Promise<T> {
  const apply = async (html: string) => {
    const result = await expand(html)
    results.push(result)
    return result.html
  }
  if (isDesignedSection(entry)) return { ...entry, pages: await Promise.all(entry.pages.map(async (page) => ({ ...page, html: await apply(page.html) }))) }
  if (isTemplatedSection(entry)) {
    return {
      ...entry,
      pages: await Promise.all(
        entry.pages.map(async (page) => ({
          ...page,
          regions: Object.fromEntries(await Promise.all(Object.entries(page.regions).map(async ([key, html]) => [key, await apply(html)] as const))),
        })),
      ),
    }
  }
  if ('html' in entry) return { ...entry, html: await apply(entry.html) }
  return entry
}

export async function expandFrameBook(book: Book, motifs: MotifsOptions | undefined, signal: AbortSignal): Promise<ExpandedBook<Book>> {
  if (!motifs) {
    const refusal = bookMotifRefusal(book)
    if (refusal) throw refusal
    return { book, fonts: [] }
  }
  const results: ExpandedMotifs[] = []
  const expand = (html: string) => expandBookHtml(html, false, book.lang, book.scripts, motifs, signal)
  const parentPages = await Promise.all(
    book.parentPages.map(async (parent) => {
      const apply = async (html: string) => {
        const result = await expandBookHtml(html, true, book.lang, book.scripts, motifs, signal)
        results.push(result)
        return result.html
      }
      return {
        ...parent,
        ...(parent.head === undefined ? {} : { head: await apply(parent.head) }),
        ...(parent.foot === undefined ? {} : { foot: await apply(parent.foot) }),
      }
    }),
  )
  const expanded = {
    ...book,
    frontMatter: await Promise.all(book.frontMatter.map((entry) => expandEntry(entry, expand, results))),
    chapters: await Promise.all(book.chapters.map((entry) => expandEntry(entry, expand, results))),
    templates: await Promise.all(
      book.templates.map(async (template) => {
        const result = await expand(template.html)
        results.push(result)
        return { ...template, html: result.html }
      }),
    ),
    parentPages,
  }
  const summary = motifSummary(results)
  motifs.placed?.(summary)
  return { book: expanded, fonts: summary.fonts }
}

export async function expandFrameBookView(view: BookView, motifs: MotifsOptions, signal: AbortSignal): Promise<ExpandedBook<BookView>> {
  const results: ExpandedMotifs[] = []
  const apply = async (html: string, furniture = false) => {
    const result = await expandBookHtml(html, furniture, view.lang, view.scripts, motifs, signal)
    results.push(result)
    return result.html
  }
  const pagination = view.pagination
    ? {
        ...view.pagination,
        parents: await Promise.all(
          view.pagination.parents.map(async (parent) => ({
            ...parent,
            ...(parent.head === undefined ? {} : { head: await apply(parent.head, true) }),
            ...(parent.foot === undefined ? {} : { foot: await apply(parent.foot, true) }),
          })),
        ),
      }
    : undefined
  const book = {
    ...view,
    html: await apply(view.html),
    ...(view.flow === undefined ? {} : { flow: await apply(view.flow) }),
    ...(pagination === undefined ? {} : { pagination }),
  }
  const summary = motifSummary(results)
  motifs.placed?.(summary)
  return { book, fonts: summary.fonts }
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
  const summaries = [result, ...parentResults.values()]
  const summary = {
    placed: summaries.flatMap((item) => item.placed),
    fonts: summaries.flatMap((item) => item.fonts),
    unavailable: [...new Set(summaries.flatMap((item) => item.unavailable))],
  }
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
