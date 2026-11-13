import { z } from 'zod'
import { AsOf } from './as-of.ts'
import { lineKeyedNoteSeriesIssues } from './book-note-series.ts'
import { resolveBookPageGeometry, sectionPageGeometry } from './book-page-geometry.ts'
import { parentPaperIssues } from './book-parent-geometry-policy.ts'
import {
  BookChapterEntry,
  BookItem,
  BookTemplate,
  bookParentIssues,
  bookSectionOpensFacts,
  bookSections,
  flowingSection,
  isPart,
  isPlacedSection,
} from './book-section.ts'
import { partDepthIssues, structuralBookIssues } from './book-structure-policy.ts'
import { closedObject } from './closed-object.ts'
import { Direction, TextDirection } from './direction.ts'
import { pageGeometryIssues } from './document-page-geometry-policy.ts'
import { refineDocumentVariables } from './document-variable-refinement.ts'
import { HeadTemplates } from './head-template.ts'
import { DocumentLimitsValue } from './limits.ts'
import { LineNumbers, SideNotes } from './line-numbers.ts'
import { RequiredLogicalMargin } from './margins.ts'
import { NoteSeriesEntries, noteSeriesIssues, resolveNoteSeries } from './note-series.ts'
import { defaultPageNumbering, divisionNumbering, divisionPrints, NoteMarker, NumberSystem } from './numbering.ts'
import { DefaultOutline, OutlineSource } from './outline.ts'
import { Orientation, Paper, sheetMm } from './paper.ts'
import { effectiveParentRules, FLOWING_PARENT_RULES, parentRules, textHoldingParentRules } from './parent-rules.ts'
import { Placement } from './placement.ts'
import { PressGeometry } from './print.ts'
import { bookParentPages, Fragmentation, ParentPage, textArea } from './printed-pages.ts'
import { Scripts } from './scripts.ts'
import { sectionNumberingIssues } from './section-numbering-policy.ts'
import { sectionOpensIssues } from './section-opens-policy.ts'
import { Slots } from './slots.ts'
import { Brand, StyleSheet } from './style-sheet.ts'
import { Variables } from './variable.ts'
import { VariableDocumentFacts } from './variable-document-facts.ts'

export { bookPageGeometries, bookPageName, type ResolvedBookPageGeometry, resolveBookPageGeometry, sectionPageGeometry } from './book-page-geometry.ts'
export { resolveBookPagination } from './book-pagination.ts'
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
  TemplatedPage,
  TemplatedSection,
} from './book-section.ts'
export type { PageGeometry } from './style-sheet.ts'

export const BookMode = z.enum(['continuous', 'paginated'])
export type BookMode = z.infer<typeof BookMode>

const BookPrinted = closedObject({ frontMatter: z.boolean().optional(), body: z.boolean().optional() })

export const BookPage = closedObject({
  paper: Paper,
  orientation: Orientation.default('portrait'),
  margin: RequiredLogicalMargin,
  columnGap: z.number().nonnegative().default(4),
})
export type BookPage = z.infer<typeof BookPage>

export const BookShape = closedObject({
  brand: Brand.optional(),
  title: z.string(),
  authors: z.array(z.string()).optional(),
  subject: z.string().optional(),
  extra: z.record(z.string(), z.string()).optional(),
  mode: BookMode,
  outline: DefaultOutline,
  limits: DocumentLimitsValue.optional(),
  page: BookPage.optional(),
  scripts: Scripts.default('refuse'),
  dir: Direction.optional(),
  lang: z.string().optional(),
  lineNumbers: LineNumbers.optional(),
  sideNotes: SideNotes.optional(),
  frontMatter: z.array(BookItem).default([]),
  body: z.array(BookItem).optional(),
  endMatter: z.array(BookItem).default([]),
  chapters: z.array(BookChapterEntry).optional(),
  parentPages: z.array(ParentPage).default([]),
  parentRules: parentRules.optional(),
  templates: z.array(BookTemplate).default([]),
  variables: Variables,
  headTemplates: HeadTemplates,
  slots: Slots.optional(),
  style: StyleSheet.optional(),
  asOf: AsOf.optional(),
  print: PressGeometry.optional(),
  numbering: closedObject({
    frontMatter: NumberSystem.optional(),
    body: NumberSystem.optional(),
    printed: BookPrinted.optional(),
  }).default({}),
  footnotes: closedObject({
    marker: NoteMarker.optional(),
    restart: z.enum(['chapter', 'book']).default('chapter'),
  }).default({ restart: 'chapter' }),
  endnotes: closedObject({
    marker: NoteMarker.optional(),
    placement: z.enum(['book', 'chapter']).default('book'),
    title: z.string().optional(),
  }).default({ placement: 'book' }),
  notes: NoteSeriesEntries.default([]),
  rectoOpenings: z.boolean().default(false),
  orphans: z.number().int().min(1).default(2),
  widows: z.number().int().min(1).default(2),
  fragmentation: Fragmentation.default('safe'),
  contents: closedObject({ pageNumbers: z.boolean().default(true), depth: z.number().int().min(1).max(6).default(2) }).default({ pageNumbers: true, depth: 2 }),
})

export const LineNoteSeries = closedObject({ name: z.string(), system: NumberSystem })
export type LineNoteSeries = z.infer<typeof LineNoteSeries>

export const BookViewPagination = closedObject({
  paper: closedObject({ width: z.number().positive(), height: z.number().positive() }),
  margin: BookPage.shape.margin,
  columnGap: z.number().nonnegative(),
  geometries: z.array(
    closedObject({
      name: z.string().optional(),
      paper: closedObject({ width: z.number().positive(), height: z.number().positive() }),
      margin: BookPage.shape.margin,
      columns: closedObject({ count: z.number().int().positive(), gap: z.number().nonnegative() }),
      parents: z.array(ParentPage.pick({ name: true }).extend({ margin: BookPage.shape.margin })),
    }),
  ),
  direction: TextDirection,
  numbering: closedObject({
    frontMatter: NumberSystem,
    body: NumberSystem,
    printed: BookPrinted.default({}).transform((printed) => ({
      frontMatter: divisionPrints({ printed }, 'frontMatter'),
      body: divisionPrints({ printed }, 'body'),
    })),
  }),
  rectoOpenings: z.boolean(),
  orphans: z.number().int().min(1),
  widows: z.number().int().min(1),
  parents: z.array(ParentPage),
  endnotePlacement: z.enum(['book', 'chapter']),
  contents: closedObject({ pageNumbers: z.boolean(), depth: z.number().int().min(1).max(6) }),
  variables: Variables,
  headTemplates: HeadTemplates,
  recordSlotsByFlow: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  outline: OutlineSource.optional(),
  document: VariableDocumentFacts.optional(),
  lineNumbers: LineNumbers.optional(),
  sideNotes: SideNotes.optional(),
  lineNoteSeries: z.array(LineNoteSeries).optional(),
}).superRefine((pagination, ctx) =>
  refineDocumentVariables(
    {
      variables: pagination.variables,
      headTemplates: pagination.headTemplates,
      parentPages: pagination.parents,
      recordSlotNames: Object.values(pagination.recordSlotsByFlow ?? {}).flatMap((slots) => Object.keys(slots)),
      metadata: pagination.document?.metadata,
      lang: pagination.document?.lang,
    },
    ctx,
  ),
)
export type BookViewPagination = z.infer<typeof BookViewPagination>

export const BookView = BookShape.pick({ title: true, brand: true, dir: true, lang: true, scripts: true, style: true, limits: true, asOf: true }).extend({
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
  for (const issue of lineKeyedNoteSeriesIssues({ lang: book.lang, mode: book.mode, lineNumbers: book.lineNumbers, notes: book.notes })) {
    ctx.addIssue({ code: 'custom', ...issue })
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

export const ResolvedBook = ValidatedBookShape.transform((book, ctx) => {
  const { chapters, ...fields } = book
  if (book.body !== undefined && chapters !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['body'], message: 'body and chapters were both given; keep body and remove chapters' })
    ctx.addIssue({ code: 'custom', path: ['chapters'], message: 'chapters and body were both given; keep body and remove chapters' })
  }
  const notes = resolveNoteSeries({
    lang: book.lang,
    lineNumberSystem: book.lineNumbers?.system ?? book.numbering?.body ?? defaultPageNumbering(book.lang),
    footnotes: book.footnotes,
    endnotes: book.endnotes,
    notes: book.notes,
  })
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

function declaredPartNames(items: ResolvedBookValue['body']): string[] {
  return items.flatMap((item) => (isPart(item) ? [item.name, ...declaredPartNames(item.children)] : []))
}

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
    const rules = effectiveParentRules(flow.parentRules, book.parentRules, FLOWING_PARENT_RULES)
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

function refineBookVariables(book: ResolvedBookValue, ctx: z.RefinementCtx): void {
  refineDocumentVariables(
    {
      variables: book.variables,
      headTemplates: book.headTemplates,
      parentPages: book.parentPages,
      templates: book.templates,
      partNames: declaredPartNames([...book.frontMatter, ...book.body, ...book.endMatter]),
      recordSlotNames: bookSections(book).flatMap(({ entry }) => ('values' in entry && entry.values ? Object.keys(entry.values) : [])),
      metadata: { extra: book.extra },
      kind: 'book',
      lang: book.lang,
    },
    ctx,
  )
}

export function refineBookPolicies(book: ResolvedBookValue, ctx: z.RefinementCtx): void {
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
  if (book.frontMatter.length > 0 && book.numbering.printed.frontMatter && book.numbering.printed.body && book.numbering.frontMatter === book.numbering.body) {
    ctx.addIssue({
      code: 'custom',
      path: ['numbering'],
      message: `front-matter and body numbering are both ${book.numbering.body}; the two must differ when both divisions print their folios, or set numbering.printed.frontMatter or numbering.printed.body to false to share the system`,
    })
  }
  for (const issue of noteSeriesIssues(book.notes, book.mode)) ctx.addIssue({ code: 'custom', ...issue })
  for (const issue of bookParentIssues(book)) ctx.addIssue({ code: 'custom', ...issue })
  refineParentPageGeometry(book, ctx)
}

const RefinedBook = ResolvedBook.superRefine((book, ctx) => {
  refineBookVariables(book, ctx)
  refineBookPolicies(book, ctx)
})

const DepthCheckedBook = z.preprocess((value, ctx) => {
  for (const issue of partDepthIssues(value)) ctx.addIssue({ code: 'custom', ...issue })
  return value
}, RefinedBook)

export const Book = DepthCheckedBook.transform(({ bodyKey: _bodyKey, ...book }) => book)
export type Book = z.infer<typeof Book>
