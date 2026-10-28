import { z } from 'zod'
import { BookChapterEntry, BookFrontMatterEntry, BookTemplate, bookParentIssues, isBookContents } from './book-section.ts'
import { Direction, resolveDirection } from './direction.ts'
import { FontReference } from './fonts.ts'
import { isHebrew, NoteMarker, NumberSystem } from './numbering.ts'
import { Orientation, Paper, sheetMm } from './paper.ts'
import { bookParentPages, ParentPage } from './printed-pages.ts'
import { Scripts } from './scripts.ts'
import { Slots } from './slots.ts'

export {
  BookChapterEntry,
  BookContents,
  BookFrontMatterEntry,
  BookOpens,
  BookSection,
  BookSectionParents,
  BookTemplate,
  Chapter,
  DesignedPage,
  DesignedSection,
  isBookContents,
  isChapter,
  isDesignedSection,
  isTemplatedSection,
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

export const BookRunningHeadSource = z.union([z.literal('title'), z.object({ mark: z.string().min(1), which: z.enum(['first', 'last']) })])
export type BookRunningHeadSource = z.infer<typeof BookRunningHeadSource>

export const BookRunningHead = z.object({
  recto: BookRunningHeadSource.default('title'),
  verso: BookRunningHeadSource.default('title'),
})
export type BookRunningHead = z.infer<typeof BookRunningHead>

export const BookShape = z.object({
  title: z.string(),
  mode: BookMode,
  page: BookPage.optional(),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  frontMatter: z.array(BookFrontMatterEntry).default([]),
  chapters: z.array(BookChapterEntry).min(1),
  parentPages: z.array(ParentPage).default([]),
  templates: z.array(BookTemplate).default([]),
  slots: Slots.optional(),
  fonts: z.array(FontReference).optional(),
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

export const BookView = BookShape.pick({ title: true, dir: true, lang: true, scripts: true, fonts: true }).extend({
  title: BookShape.shape.title.optional(),
  html: z.string(),
  pagination: BookViewPagination.optional(),
})
export type BookView = z.infer<typeof BookView>
export type BookViewInput = z.input<typeof BookView>

const ResolvedBook = BookShape.transform((book) => {
  const hebrew = isHebrew(book.lang)
  return {
    ...book,
    numbering: {
      frontMatter: book.numbering.frontMatter ?? (hebrew ? 'arabic' : 'roman-lower'),
      body: book.numbering.body ?? (hebrew ? 'hebrew' : 'arabic'),
    },
    footnotes: { ...book.footnotes, marker: book.footnotes.marker ?? (hebrew ? 'hebrew' : 'symbols') },
    endnotes: { ...book.endnotes, marker: book.endnotes.marker ?? 'arabic', title: book.endnotes.title ?? (hebrew ? 'הערות' : 'Notes') },
  }
})

export const Book = ResolvedBook.superRefine((book, ctx) => {
  const contentsPositions = book.frontMatter.flatMap((entry, index) => (isBookContents(entry) ? [index + 1] : []))
  if (contentsPositions.length > 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['frontMatter'],
      message: `front-matter entries at positions ${contentsPositions[0]} and ${contentsPositions[1]} are both contents entries; one must go`,
    })
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
  const vertical = book.page.margin.top + book.page.margin.bottom
  const horizontal = book.page.margin.inner + book.page.margin.outer
  if (vertical >= trim.height) {
    ctx.addIssue({
      code: 'custom',
      path: ['page', 'margin'],
      message: `the top and bottom margins total ${vertical}mm and the page is ${trim.height}mm high; reduce the vertical margins to leave a text area`,
    })
  }
  if (horizontal >= trim.width) {
    ctx.addIssue({
      code: 'custom',
      path: ['page', 'margin'],
      message: `the inner and outer margins total ${horizontal}mm and the page is ${trim.width}mm wide; reduce the horizontal margins to leave a text area`,
    })
  }
})
export type Book = z.infer<typeof Book>
export type BookInput = z.input<typeof Book>

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
