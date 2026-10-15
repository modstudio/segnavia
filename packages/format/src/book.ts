import { z } from 'zod'
import { Direction } from './direction.ts'
import { NoteMarker, NumberSystem } from './numbering.ts'
import { Paper, sheetMm } from './paper.ts'
import { Scripts } from './scripts.ts'

export const BookMode = z.enum(['continuous', 'paginated'])
export type BookMode = z.infer<typeof BookMode>

export const BookSection = z.object({
  title: z.string().optional(),
  html: z.string(),
  contents: z.boolean().default(true),
})
export type BookSection = z.infer<typeof BookSection>

export const Chapter = z.object({
  title: z.string(),
  html: z.string(),
  runningHead: z.string().optional(),
})
export type Chapter = z.infer<typeof Chapter>

export const BookPage = z.object({
  paper: Paper,
  orientation: z.enum(['portrait', 'landscape']).default('portrait'),
  margin: z.object({
    top: z.number().nonnegative(),
    bottom: z.number().nonnegative(),
    inner: z.number().nonnegative(),
    outer: z.number().nonnegative(),
  }),
})
export type BookPage = z.infer<typeof BookPage>

export const BookShape = z.object({
  title: z.string(),
  mode: BookMode,
  page: BookPage.optional(),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  frontMatter: z.array(BookSection).default([]),
  chapters: z.array(Chapter).min(1),
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
    })
    .default({ placement: 'book' }),
  rightHandOpenings: z.boolean().default(false),
  contents: z.object({ pageNumbers: z.boolean().default(true) }).default({ pageNumbers: true }),
})

function isHebrew(lang: string | undefined): boolean {
  const primary = lang?.split('-')[0]?.toLowerCase()
  return primary === 'he' || primary === 'iw'
}

const ResolvedBook = BookShape.transform((book) => {
  const hebrew = isHebrew(book.lang)
  return {
    ...book,
    numbering: {
      frontMatter: book.numbering.frontMatter ?? (hebrew ? 'arabic' : 'roman-lower'),
      body: book.numbering.body ?? (hebrew ? 'hebrew' : 'arabic'),
    },
    footnotes: { ...book.footnotes, marker: book.footnotes.marker ?? (hebrew ? 'hebrew' : 'symbols') },
    endnotes: { ...book.endnotes, marker: book.endnotes.marker ?? 'arabic' },
  }
})

export const Book = ResolvedBook.superRefine((book, ctx) => {
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

// This is the one Book refusal that depends on chapter content. The HTML
// reader applies it once it knows which note kinds are used; Book.parse cannot.
export function noteMarkerIssues(book: Book, used: { footnotes: boolean; endnotes: boolean }): string[] {
  if (!used.footnotes || !used.endnotes || book.footnotes.marker !== book.endnotes.marker) return []
  return [`footnote and endnote markers are both ${book.footnotes.marker}; the two must differ when both kinds are used`]
}
