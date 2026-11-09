import { z } from 'zod'
import { AsOf } from './as-of.ts'
import { bookPageGeometries, resolveBookPageGeometry, sectionPageGeometry } from './book-page-geometry.ts'
import { parentPaperIssues } from './book-parent-geometry-policy.ts'
import {
  BookChapterEntry,
  BookItem,
  BookTemplate,
  bookParentIssues,
  bookSectionOpensFacts,
  bookSections,
  flowingSection,
  isPlacedSection,
  REGION_NAME,
} from './book-section.ts'
import { partDepthIssues, structuralBookIssues } from './book-structure-policy.ts'
import { Direction, resolveDirection, TextDirection } from './direction.ts'
import { pageGeometryIssues } from './document-page-geometry-policy.ts'
import { DocumentLimitsValue } from './limits.ts'
import { RequiredLogicalMargin } from './margins.ts'
import { NoteSeries, noteSeriesIssues, resolveNoteSeries } from './note-series.ts'
import { divisionNumbering, NoteMarker, NumberSystem } from './numbering.ts'
import { Orientation, Paper, sheetMm } from './paper.ts'
import { FLOWING_PARENT_RULES, parentRules, textHoldingParentRules } from './parent-rules.ts'
import { Placement } from './placement.ts'
import { PressGeometry } from './print.ts'
import { bookParentPages, Fragmentation, ParentPage, textArea } from './printed-pages.ts'
import { Scripts } from './scripts.ts'
import { sectionNumberingIssues } from './section-numbering-policy.ts'
import { sectionOpensIssues } from './section-opens-policy.ts'
import { Slots } from './slots.ts'
import { Brand, StyleSheet } from './style-sheet.ts'
import { Variable } from './variable.ts'

export { bookPageGeometries, bookPageName, type ResolvedBookPageGeometry, resolveBookPageGeometry, sectionPageGeometry } from './book-page-geometry.ts'
export {
  BookChapterEntry,
  BookContents,
  type BookDivision,
  type BookDivisions,
  BookFrontMatterEntry,
  BookItem,
  BookOpens,
  BookSection,
  type BookSectionEntry,
  BookTemplate,
  bookSectionOpensFacts,
  bookSections,
  Chapter,
  DesignedPage,
  DesignedSection,
  flowingSection,
  isBookContents,
  isChapter,
  isDesignedSection,
  isPart,
  isPlacedSection,
  isTemplatedSection,
  MAX_PART_DEPTH,
  Part,
  PlacedSection,
  REGION_NAME,
  SECTION_BOUNDARY_CLASS,
  SECTION_TITLE_MARK,
  TemplatedPage,
  TemplatedSection,
} from './book-section.ts'
export type { PageGeometry } from './style-sheet.ts'

export const BookMode = z.enum(['continuous', 'paginated'])
export type BookMode = z.infer<typeof BookMode>

export const BookPage = z.object({
  paper: Paper,
  orientation: Orientation.default('portrait'),
  margin: RequiredLogicalMargin,
  columnGap: z.number().nonnegative().default(4),
})
export type BookPage = z.infer<typeof BookPage>

export const BookRunningHeadSource = z.union([
  z.literal('title'),
  z.object({ mark: z.string().min(1), which: z.enum(['first', 'last']) }),
  z.object({ part: z.string().regex(REGION_NAME) }),
])
export type BookRunningHeadSource = z.infer<typeof BookRunningHeadSource>

export const BookRunningHead = z.object({
  recto: BookRunningHeadSource.default('title'),
  verso: BookRunningHeadSource.default('title'),
})
export type BookRunningHead = z.infer<typeof BookRunningHead>

export const BookShape = z.object({
  brand: Brand.optional(),
  title: z.string(),
  authors: z.array(z.string()).optional(),
  subject: z.string().optional(),
  mode: BookMode,
  limits: DocumentLimitsValue.optional(),
  page: BookPage.optional(),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  frontMatter: z.array(BookItem).default([]),
  body: z.array(BookItem).optional(),
  endMatter: z.array(BookItem).default([]),
  chapters: z.array(BookChapterEntry).optional(),
  parentPages: z.array(ParentPage).default([]),
  parentRules: parentRules.optional(),
  templates: z.array(BookTemplate).default([]),
  variables: z.array(Variable).default([]),
  slots: Slots.optional(),
  style: StyleSheet.optional(),
  asOf: AsOf.optional(),
  print: PressGeometry.optional(),
  numbering: z
    .object({
      frontMatter: NumberSystem.optional(),
      body: NumberSystem.optional(),
    })
    .default({}),
  footnotes: z
    .object({
      marker: NoteMarker.optional(),
      restart: z.enum(['chapter', 'book']).default('chapter'),
    })
    .default({ restart: 'chapter' }),
  endnotes: z
    .object({
      marker: NoteMarker.optional(),
      placement: z.enum(['book', 'chapter']).default('book'),
      title: z.string().optional(),
    })
    .default({ placement: 'book' }),
  notes: z.array(NoteSeries).default([]),
  rectoOpenings: z.boolean().default(false),
  orphans: z.number().int().min(1).default(2),
  widows: z.number().int().min(1).default(2),
  fragmentation: Fragmentation.default('safe'),
  runningHead: BookRunningHead.default({ recto: 'title', verso: 'title' }),
  contents: z.object({ pageNumbers: z.boolean().default(true), depth: z.number().int().min(1).max(6).default(2) }).default({ pageNumbers: true, depth: 2 }),
})

export const BookViewPagination = z.object({
  paper: z.object({ width: z.number().positive(), height: z.number().positive() }),
  margin: BookPage.shape.margin,
  columnGap: z.number().nonnegative(),
  geometries: z.array(
    z.object({
      name: z.string().optional(),
      paper: z.object({ width: z.number().positive(), height: z.number().positive() }),
      margin: BookPage.shape.margin,
      columns: z.object({ count: z.number().int().positive(), gap: z.number().nonnegative() }),
      parents: z.array(ParentPage.pick({ name: true }).extend({ margin: BookPage.shape.margin })),
    }),
  ),
  direction: TextDirection,
  numbering: z.object({ frontMatter: NumberSystem, body: NumberSystem }),
  rectoOpenings: z.boolean(),
  orphans: z.number().int().min(1),
  widows: z.number().int().min(1),
  parents: z.array(ParentPage),
  endnotePlacement: z.enum(['book', 'chapter']),
  contents: z.object({ pageNumbers: z.boolean(), depth: z.number().int().min(1).max(6) }),
  runningHead: BookRunningHead,
  variables: z.array(Variable).optional(),
})
export type BookViewPagination = z.infer<typeof BookViewPagination>

export const BookView = BookShape.pick({ title: true, brand: true, dir: true, lang: true, scripts: true, style: true, limits: true }).extend({
  title: BookShape.shape.title.optional(),
  html: z.string(),
  flow: z.string().optional(),
  pagination: BookViewPagination.optional(),
})
export type BookView = z.infer<typeof BookView>
export type BookViewInput = z.input<typeof BookView>

const ValidatedBookShape = BookShape.superRefine((book, ctx) => {
  for (const { entry, path } of bookSections({ ...book, body: book.body ?? book.chapters ?? [] })) {
    if (!isPlacedSection(entry)) continue
    try {
      Placement.parse(entry.placement, 'book')
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: [...path, 'placement'], message: error instanceof Error ? error.message : String(error) })
    }
  }
  const seen = new Set<string>()
  book.notes.forEach(({ name }, index) => {
    if (seen.has(name)) {
      ctx.addIssue({ code: 'custom', path: ['notes', index, 'name'], message: `note series ${name} is duplicated; give every series a unique name` })
    }
    seen.add(name)
    if (name !== 'footnote' && name !== 'endnote') {
      if (book.notes[index]?.placement === undefined) {
        ctx.addIssue({ code: 'custom', path: ['notes', index, 'placement'], message: `note series ${name} needs placement` })
      }
      if (book.notes[index]?.numbering === undefined) {
        ctx.addIssue({ code: 'custom', path: ['notes', index, 'numbering'], message: `note series ${name} needs numbering` })
      }
    }
  })
})

const ResolvedBook = ValidatedBookShape.transform((book, ctx) => {
  const { chapters, ...fields } = book
  if (book.body !== undefined && chapters !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'body and chapters were both given; keep body and remove chapters' })
    ctx.addIssue({ code: 'custom', path: ['chapters'], message: 'chapters and body were both given; keep body and remove chapters' })
  }
  const notes = resolveNoteSeries({ lang: book.lang, footnotes: book.footnotes, endnotes: book.endnotes, notes: book.notes })
  const footnote = notes[0]
  const endnote = notes[1]
  if (!footnote || !endnote) throw new Error('note series resolution did not produce the two default series')
  return {
    ...fields,
    body: book.body ?? chapters ?? [],
    bodyKey: book.body === undefined && chapters !== undefined ? ('chapters' as const) : ('body' as const),
    numbering: divisionNumbering(book.lang, book.numbering),
    footnotes: { ...book.footnotes, marker: footnote.marker },
    endnotes: { ...book.endnotes, marker: endnote.marker, title: endnote.title },
    notes,
  }
})

type ResolvedBookValue = z.infer<typeof ResolvedBook>

function refineNamedPageGeometries(book: ResolvedBookValue, ctx: z.RefinementCtx): void {
  const declaredNames = Object.keys(book.style?.pageGeometries ?? {})
  const facts = bookSections(book).flatMap((section) => {
    if (!('pageGeometry' in section.entry) || section.entry.pageGeometry === undefined) return []
    const title = section.entry.title ?? section.id
    return [{ label: `${title} (${section.id})`, path: section.path, pageGeometry: section.entry.pageGeometry, declaredNames, mode: book.mode }]
  })
  for (const issue of pageGeometryIssues(facts)) ctx.addIssue({ code: 'custom', ...issue })
}

function refineParentPageGeometry(book: ResolvedBookValue, ctx: z.RefinementCtx): void {
  const page = book.page
  if (!page) return
  const trim = sheetMm(page)
  const parents = resolveBookPageGeometry(book)?.parents ?? []
  const defaults = new Set(bookParentPages(page.margin).map((parent) => parent.name))
  for (const parent of parents) {
    const area = textArea(parent, trim)
    const path = defaults.has(parent.name) ? ['page', 'margin'] : ['parentPages']
    if (area.height <= 0) {
      const total = parent.margin.blockStart + parent.margin.blockEnd
      ctx.addIssue({
        code: 'custom',
        path,
        message: `parent page "${parent.name}" has top and bottom margins totaling ${total}mm on paper ${trim.height}mm high; reduce the vertical margins to leave a text area`,
      })
    }
    if (area.width <= 0) {
      const total = parent.margin.inlineStart + parent.margin.inlineEnd
      ctx.addIssue({
        code: 'custom',
        path,
        message: `parent page "${parent.name}" has inner and outer margins totaling ${total}mm on paper ${trim.width}mm wide; reduce the horizontal margins to leave a text area`,
      })
    }
  }
  const flowing = bookSections(book).filter(({ entry }) => flowingSection(entry))
  flowing.forEach((section, index) => {
    const { entry: flow, path } = section
    const geometry = sectionPageGeometry(book as Book, section)
    const sectionTrim = geometry?.paper ?? trim
    const sectionParents = geometry?.parents ?? parents
    const byName = new Map(sectionParents.map((parent) => [parent.name, parent]))
    const rules = flow.parentRules ?? book.parentRules ?? FLOWING_PARENT_RULES
    const names = [...new Set(textHoldingParentRules(rules).map((rule) => rule.parent))]
    const widths = names.flatMap((name) => {
      const parent = byName.get(name)
      return parent ? [{ name, width: textArea(parent, sectionTrim).width }] : []
    })
    const label = flow.title ?? `flow ${index + 1}`
    const fitFacts = names.flatMap((name) => {
      const parent = byName.get(name)
      return parent ? [{ section: label, parent: name, path, paper: sectionTrim, textArea: textArea(parent, sectionTrim) }] : []
    })
    for (const issue of parentPaperIssues(fitFacts)) ctx.addIssue({ code: 'custom', ...issue })
    if (fitFacts.some((fact) => fact.textArea.width <= 0 || fact.textArea.height <= 0)) return
    const first = widths[0]
    const different = widths.find((candidate) => candidate.width !== first?.width)
    if (!first || !different) return
    ctx.addIssue({
      code: 'custom',
      path,
      message: `the ${label} flow uses parent pages "${first.name}" (${first.width}mm) and "${different.name}" (${different.width}mm) with different text widths; make the widths equal or split the flow into sections to clear this refusal`,
    })
  })
}

const RefinedBook = ResolvedBook.superRefine((book, ctx) => {
  for (const issue of structuralBookIssues(book)) ctx.addIssue({ code: 'custom', ...issue })
  const sections = bookSections(book)
  const geometryByPath = new Map(sections.map((section) => [section.path.join('.'), sectionPageGeometry(book as Book, section)]))
  refineNamedPageGeometries(book, ctx)
  const opensFacts = bookSectionOpensFacts(book).map((fact) => ({
    ...fact,
    geometry: geometryByPath.get(fact.path.join('.')),
  }))
  for (const issue of sectionOpensIssues(opensFacts)) {
    ctx.addIssue({ code: 'custom', ...issue })
  }
  const numberedSections = sections.flatMap(({ entry, division, id, path }) =>
    'numbering' in entry && entry.numbering !== undefined ? [{ id, title: entry.title, division, path, numbering: entry.numbering }] : [],
  )
  for (const issue of sectionNumberingIssues({ mode: book.mode, systems: book.numbering, sections: numberedSections })) {
    ctx.addIssue({ code: 'custom', ...issue })
  }
  if (book.mode === 'paginated' && !book.page) {
    ctx.addIssue({ code: 'custom', path: ['page'], message: 'a paginated book needs page; set page or use continuous mode' })
  }
  if (book.frontMatter.length > 0 && book.numbering.frontMatter === book.numbering.body) {
    ctx.addIssue({
      code: 'custom',
      path: ['numbering'],
      message: `front-matter and body numbering are both ${book.numbering.body}; the two must differ when front matter is present`,
    })
  }
  for (const issue of noteSeriesIssues(book.notes, book.mode)) ctx.addIssue({ code: 'custom', ...issue })
  for (const issue of bookParentIssues(book)) ctx.addIssue({ code: 'custom', ...issue })
  refineParentPageGeometry(book, ctx)
})

const DepthCheckedBook = z.preprocess((value, ctx) => {
  for (const issue of partDepthIssues(value)) ctx.addIssue({ code: 'custom', ...issue })
  return value
}, RefinedBook)

export const Book = DepthCheckedBook.transform(({ bodyKey: _bodyKey, ...book }) => book)
export type Book = z.infer<typeof Book>

export function resolveBookPagination(book: Book): BookViewPagination | undefined {
  if (book.mode !== 'paginated' || !book.page) return undefined
  return {
    paper: sheetMm(book.page),
    margin: book.page.margin,
    columnGap: book.page.columnGap,
    geometries: bookPageGeometries(book),
    direction: resolveDirection(book.dir, book.lang, book.title),
    numbering: book.numbering,
    rectoOpenings: book.rectoOpenings,
    orphans: book.orphans,
    widows: book.widows,
    parents: [...bookParentPages(book.page.margin), ...book.parentPages],
    endnotePlacement: book.endnotes.placement,
    contents: book.contents,
    runningHead: book.runningHead,
    variables: book.variables,
  }
}
