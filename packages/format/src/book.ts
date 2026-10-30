import { z } from 'zod'
import {
  BookChapterEntry,
  BookItem,
  BookTemplate,
  bookParentIssues,
  bookSections,
  isBookContents,
  isDesignedSection,
  isPart,
  isTemplatedSection,
  MAX_PART_DEPTH,
  REGION_NAME,
} from './book-section.ts'
import { Direction, resolveDirection } from './direction.ts'
import { FontReference } from './fonts.ts'
import { isHebrew, NoteMarker, NumberSystem } from './numbering.ts'
import { Orientation, Paper, sheetMm } from './paper.ts'
import { bookParentPages, flowingParentNames, ParentPage, resolveParentPages, textArea } from './printed-pages.ts'
import { Scripts } from './scripts.ts'
import { Slots } from './slots.ts'

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
  BookSectionParents,
  BookTemplate,
  bookSections,
  Chapter,
  DesignedPage,
  DesignedSection,
  isBookContents,
  isChapter,
  isDesignedSection,
  isPart,
  isTemplatedSection,
  MAX_PART_DEPTH,
  Part,
  REGION_NAME,
  TemplatedPage,
  TemplatedSection,
} from './book-section.ts'

export const BookMode = z.enum(['continuous', 'paginated'])
export type BookMode = z.infer<typeof BookMode>

export const BookPage = z.object({
  paper: Paper,
  orientation: Orientation.default('portrait'),
  margin: z.object({
    top: z.number().nonnegative(),
    bottom: z.number().nonnegative(),
    inner: z.number().nonnegative(),
    outer: z.number().nonnegative(),
  }),
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
  title: z.string(),
  authors: z.array(z.string()).optional(),
  subject: z.string().optional(),
  mode: BookMode,
  page: BookPage.optional(),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  frontMatter: z.array(BookItem).default([]),
  body: z.array(BookItem).optional(),
  endMatter: z.array(BookItem).default([]),
  chapters: z.array(BookChapterEntry).optional(),
  parentPages: z.array(ParentPage).default([]),
  templates: z.array(BookTemplate).default([]),
  slots: Slots.optional(),
  fonts: z.array(FontReference).optional(),
  css: z.string().optional(),
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
  rectoOpenings: z.boolean().default(false),
  orphans: z.number().int().min(1).default(2),
  widows: z.number().int().min(1).default(2),
  runningHead: BookRunningHead.default({ recto: 'title', verso: 'title' }),
  contents: z.object({ pageNumbers: z.boolean().default(true), depth: z.number().int().min(1).max(6).default(2) }).default({ pageNumbers: true, depth: 2 }),
})

export const BookViewPagination = z.object({
  paper: z.object({ width: z.number().positive(), height: z.number().positive() }),
  margin: BookPage.shape.margin,
  columnGap: z.number().nonnegative(),
  direction: z.enum(['ltr', 'rtl']),
  numbering: z.object({ frontMatter: NumberSystem, body: NumberSystem }),
  rectoOpenings: z.boolean(),
  orphans: z.number().int().min(1),
  widows: z.number().int().min(1),
  parents: z.array(ParentPage),
  endnotePlacement: z.enum(['book', 'chapter']),
  contents: z.object({ pageNumbers: z.boolean(), depth: z.number().int().min(1).max(6) }),
  runningHead: BookRunningHead,
})
export type BookViewPagination = z.infer<typeof BookViewPagination>

export const BookView = BookShape.pick({ title: true, dir: true, lang: true, scripts: true, fonts: true, css: true }).extend({
  title: BookShape.shape.title.optional(),
  html: z.string(),
  flow: z.string().optional(),
  pagination: BookViewPagination.optional(),
})
export type BookView = z.infer<typeof BookView>
export type BookViewInput = z.input<typeof BookView>

const ResolvedBook = BookShape.transform((book, ctx) => {
  const hebrew = isHebrew(book.lang)
  const { chapters, ...fields } = book
  if (book.body !== undefined && chapters !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'body and chapters were both given; keep body and remove chapters' })
    ctx.addIssue({ code: 'custom', path: ['chapters'], message: 'chapters and body were both given; keep body and remove chapters' })
  }
  return {
    ...fields,
    body: book.body ?? chapters ?? [],
    bodyKey: book.body === undefined && chapters !== undefined ? ('chapters' as const) : ('body' as const),
    numbering: {
      frontMatter: book.numbering.frontMatter ?? (hebrew ? 'arabic' : 'roman-lower'),
      body: book.numbering.body ?? (hebrew ? 'hebrew' : 'arabic'),
    },
    footnotes: { ...book.footnotes, marker: book.footnotes.marker ?? (hebrew ? 'hebrew' : 'symbols') },
    endnotes: { ...book.endnotes, marker: book.endnotes.marker ?? 'arabic', title: book.endnotes.title ?? (hebrew ? 'הערות' : 'Notes') },
  }
})

function partSectionIssues(items: z.infer<typeof BookItem>[], path: (string | number)[]): Array<{ path: (string | number)[]; message: string }> {
  return items.flatMap((entry, index) => {
    if (!isPart(entry)) return []
    const partPath = [...path, index]
    const hasSection =
      entry.html !== undefined ||
      bookSections({ frontMatter: [], body: entry.children, endMatter: [] }).some(({ entry: child }) => !isPart(child) || child.html !== undefined)
    const own = !hasSection
      ? [{ path: partPath, message: `part ${partPath.join('.')} has no section; add html or a section inside it to clear this refusal` }]
      : []
    return [...own, ...partSectionIssues(entry.children, [...partPath, 'children'])]
  })
}

type BookIssue = { path: (string | number)[]; message: string }

function structuralBookIssues(book: z.infer<typeof ResolvedBook>): BookIssue[] {
  const issues: BookIssue[] = []
  if (book.body.length === 0) issues.push({ path: ['body'], message: 'a book needs at least one body entry; add a chapter or part' })
  issues.push(
    ...partSectionIssues(book.frontMatter, ['frontMatter']),
    ...partSectionIssues(book.body, [book.bodyKey]),
    ...partSectionIssues(book.endMatter, ['endMatter']),
  )
  const sections = bookSections(book)
  for (const section of sections) {
    if (isBookContents(section.entry) && section.division !== 'front') {
      issues.push({ path: section.path, message: `contents belongs in frontMatter; move this ${section.division} contents entry there` })
    }
  }
  const paths = sections.flatMap(({ entry, division, path }) => (division === 'front' && isBookContents(entry) ? [path.join('.')] : []))
  if (paths.length > 1) {
    issues.push({
      path: ['frontMatter'],
      message: `front-matter entries at ${paths[0]} and ${paths[1]} are both contents entries; one must go`,
    })
  }
  return issues
}

const RefinedBook = ResolvedBook.superRefine((book, ctx) => {
  for (const issue of structuralBookIssues(book)) ctx.addIssue({ code: 'custom', ...issue })
  const sections = bookSections(book)
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
  if (book.endnotes.placement === 'chapter' && book.mode === 'continuous') {
    ctx.addIssue({
      code: 'custom',
      path: ['endnotes', 'placement'],
      message: 'endnotes are placed at the end of each chapter only in paginated mode; use book placement or paginated mode',
    })
  }
  for (const issue of bookParentIssues(book)) ctx.addIssue({ code: 'custom', ...issue })
  if (!book.page) return
  const trim = sheetMm(book.page)
  const parents = resolveParentPages([...bookParentPages(book.page.margin), ...book.parentPages])
  const defaults = new Set(bookParentPages(book.page.margin).map((parent) => parent.name))
  for (const parent of parents) {
    const area = textArea(parent, trim)
    const path = defaults.has(parent.name) ? ['page', 'margin'] : ['parentPages']
    if (area.height <= 0) {
      const total = parent.margin.top + parent.margin.bottom
      ctx.addIssue({
        code: 'custom',
        path,
        message: `parent page "${parent.name}" has top and bottom margins totaling ${total}mm on paper ${trim.height}mm high; reduce the vertical margins to leave a text area`,
      })
    }
    if (area.width <= 0) {
      const total = parent.margin.inner + parent.margin.outer
      ctx.addIssue({
        code: 'custom',
        path,
        message: `parent page "${parent.name}" has inner and outer margins totaling ${total}mm on paper ${trim.width}mm wide; reduce the horizontal margins to leave a text area`,
      })
    }
  }
  const byName = new Map(parents.map((parent) => [parent.name, parent]))
  const flowing = sections.filter(({ entry }) => !isDesignedSection(entry) && !isTemplatedSection(entry))
  flowing.forEach(({ entry: flow, path }, index) => {
    const names = flowingParentNames(flow.parents)
    const roles = Object.entries(names) as Array<[keyof typeof names, string]>
    const widths = roles.flatMap(([role, name]) => {
      const parent = byName.get(name)
      return parent ? [{ role, name, width: textArea(parent, trim).width }] : []
    })
    const first = widths[0]
    const different = widths.find((candidate) => candidate.width !== first?.width)
    if (!first || !different) return
    const label = flow.title ?? `flow ${index + 1}`
    ctx.addIssue({
      code: 'custom',
      path,
      message: `the ${label} flow uses parent pages "${first.name}" (${first.width}mm) and "${different.name}" (${different.width}mm) with different text widths; make the widths equal or split the flow into sections to clear this refusal`,
    })
  })
})

function partDepthIssues(value: unknown): Array<{ path: (string | number)[]; message: string }> {
  if (typeof value !== 'object' || value === null) return []
  const input = value as Record<string, unknown>
  const roots = [
    ['frontMatter', input.frontMatter],
    ['body', input.body],
    ['chapters', input.chapters],
    ['endMatter', input.endMatter],
  ] as const
  const stack: Array<{ value: unknown; path: (string | number)[]; depth: number }> = []
  for (const [key, entries] of roots) {
    if (!Array.isArray(entries)) continue
    entries.forEach((entry, index) => {
      stack.push({ value: entry, path: [key, index], depth: 0 })
    })
  }
  const issues: Array<{ path: (string | number)[]; message: string }> = []
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current.value !== 'object' || current.value === null || !('name' in current.value)) continue
    const depth = current.depth + 1
    if (depth > MAX_PART_DEPTH) {
      issues.push({
        path: current.path,
        message: `part ${current.path.join('.')} exceeds the maximum part depth of ${MAX_PART_DEPTH}; reduce the nesting to clear this refusal`,
      })
      continue
    }
    const children = (current.value as Record<string, unknown>).children
    if (!Array.isArray(children)) continue
    children.forEach((child, index) => {
      stack.push({ value: child, path: [...current.path, 'children', index], depth })
    })
  }
  return issues
}

const DepthCheckedBook = z.preprocess((value, ctx) => {
  for (const issue of partDepthIssues(value)) ctx.addIssue({ code: 'custom', ...issue })
  return value
}, RefinedBook)

export const Book = DepthCheckedBook.transform(({ bodyKey: _bodyKey, ...book }) => book)
export type Book = z.infer<typeof Book>
export type BookInput = z.input<typeof BookShape>

export function resolveBookPagination(book: Book): BookViewPagination | undefined {
  if (book.mode !== 'paginated' || !book.page) return undefined
  return {
    paper: sheetMm(book.page),
    margin: book.page.margin,
    columnGap: book.page.columnGap,
    direction: resolveDirection(book.dir, book.lang, book.title),
    numbering: book.numbering,
    rectoOpenings: book.rectoOpenings,
    orphans: book.orphans,
    widows: book.widows,
    parents: [...bookParentPages(book.page.margin), ...book.parentPages],
    endnotePlacement: book.endnotes.placement,
    contents: book.contents,
    runningHead: book.runningHead,
  }
}

// This is the one Book refusal that depends on chapter content. The HTML
// reader applies it once it knows which note kinds are used; Book.parse cannot.
export function noteMarkerIssues(book: Book, used: { footnotes: boolean; endnotes: boolean }): string[] {
  if (!used.footnotes || !used.endnotes || book.footnotes.marker !== book.endnotes.marker) return []
  return [`footnote and endnote markers are both ${book.footnotes.marker}; the two must differ when both kinds are used`]
}
