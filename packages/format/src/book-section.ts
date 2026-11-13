import { z } from 'zod'
import { BookOpens } from './book-opens.ts'
import { closedObject } from './closed-object.ts'
import { Direction } from './direction.ts'
import { SectionNumbering } from './folio.ts'
import { REGION_NAME } from './parent-regions.ts'
import { type ParentRules, parentRuleIssues, parentRules, renamedParentRulesFieldIssue } from './parent-rules.ts'
import { PlacementShape } from './placement.ts'
import { BOOK_PARENT_NAMES, type ParentPage, parentListIssues } from './printed-pages.ts'
import { RecordFacts, RecordValues } from './record-facts.ts'
import type { SectionOpensFact } from './section-opens-policy.ts'
import { Slots } from './slots.ts'

export { BookOpens }
export const SECTION_BOUNDARY_CLASS = 'segnavia-section-boundary'
const PartOpens = z.enum(['recto', 'verso', 'any'])

export const DesignedPage = closedObject({ html: z.string() })
export type DesignedPage = z.infer<typeof DesignedPage>

export { REGION_NAME } from './parent-regions.ts'
export const MAX_PART_DEPTH = 6

export const TemplatedPage = closedObject({
  template: z.string().min(1).optional(),
  regions: z.record(z.string(), z.string()),
})
export type TemplatedPage = z.infer<typeof TemplatedPage>

export const BookTemplate = closedObject({
  name: z.string().min(1),
  html: z.string(),
  parentRules: parentRules.optional(),
  parents: z.unknown().optional(),
  slots: Slots.optional(),
})
export type BookTemplate = z.infer<typeof BookTemplate>

const designedPagesRefusal = 'a designed section needs at least one page; add a page or remove the section to clear this refusal'
const templatedPagesRefusal = 'a templated section needs at least one page; add a page or remove the section to clear this refusal'
const regionNameClear = 'use a letter followed by letters, digits, hyphens or underscores to clear this refusal'
export const ContentsLabel = z.string().min(1, 'contentsLabel cannot be empty; omit contentsLabel or give it text to clear this refusal')
export const Subtitle = z.string().min(1, 'subtitle cannot be empty; omit subtitle or give it text to clear this refusal')

const sectionFields = {
  id: z.string(),
  title: z.string().optional(),
  contentsLabel: ContentsLabel.optional(),
  subtitle: Subtitle.optional(),
  contents: z.boolean().default(true),
  opens: BookOpens.optional(),
  parentRules: parentRules.optional(),
  parents: z.unknown().optional(),
  numbering: SectionNumbering.optional(),
  pageGeometry: z.string().optional(),
  lang: z.string().optional(),
  dir: Direction.optional(),
  values: RecordValues.optional(),
  record: RecordFacts.optional(),
  recordTemplate: closedObject({ name: z.string(), slots: Slots }).optional(),
}

const partFields = {
  id: z.string(),
  name: z.string().regex(REGION_NAME, 'a part name must be an HTML name token'),
  title: z.string().optional(),
  html: z.string().optional(),
  contents: z.boolean().default(true),
  opens: PartOpens.optional(),
  parentRules: parentRules.optional(),
  parents: z.unknown().optional(),
}

export const DesignedSection = closedObject({
  kind: z.literal('designed'),
  ...sectionFields,
  pages: z.array(DesignedPage, { error: designedPagesRefusal }).min(1, designedPagesRefusal),
})
export type DesignedSection = z.infer<typeof DesignedSection>

export const TemplatedSection = closedObject({
  kind: z.literal('templated'),
  ...sectionFields,
  template: z.string().min(1),
  pages: z.array(TemplatedPage, { error: templatedPagesRefusal }).min(1, templatedPagesRefusal),
})
export type TemplatedSection = z.infer<typeof TemplatedSection>

export const BookSection = closedObject({
  html: z.string(),
  ...sectionFields,
})
export type BookSection = z.infer<typeof BookSection>

export const BookContents = closedObject({
  id: z.string(),
  kind: z.literal('contents'),
  title: z.string().optional(),
  opens: BookOpens.optional(),
  parentRules: parentRules.optional(),
  parents: z.unknown().optional(),
  numbering: SectionNumbering.optional(),
})
export type BookContents = z.infer<typeof BookContents>

export const PlacedSection = closedObject({ kind: z.literal('placed'), placement: PlacementShape, ...sectionFields })
export type PlacedSection = z.infer<typeof PlacedSection>

const flowingFront = BookSection.extend({ kind: z.literal('front').optional() })

export const BookFrontMatterEntry = z.discriminatedUnion('kind', [DesignedSection, TemplatedSection, BookContents, PlacedSection, flowingFront])
export type BookFrontMatterEntry = z.infer<typeof BookFrontMatterEntry>

export const Chapter = BookSection.omit({ contents: true }).extend({ title: z.string() })
export type Chapter = z.infer<typeof Chapter>

const flowingChapter = Chapter.extend({ kind: z.literal('chapter').optional() })

export const BookChapterEntry = z.discriminatedUnion('kind', [DesignedSection, TemplatedSection, PlacedSection, flowingChapter])
export type BookChapterEntry = z.infer<typeof BookChapterEntry>

export interface Part extends z.infer<z.ZodObject<typeof partFields>> {
  children: BookItem[]
}

export type BookItem = Part | BookFrontMatterEntry | BookChapterEntry

export const Part: z.ZodType<Part> = z.lazy(() => closedObject({ ...partFields, children: z.array(BookItem).default([]) }))
export const BookItem: z.ZodType<BookItem> = z.lazy(() => z.union([Part, BookFrontMatterEntry, BookChapterEntry]))

export type BookDivision = 'front' | 'body' | 'end'

interface BookSectionLocation {
  ancestry: Array<{ name: string; title?: string; id: string }>
  depth: number
  path: (string | number)[]
}

export type BookSectionEntry = BookSectionLocation & { entry: BookItem; division: BookDivision; id: string }

export function isPart(entry: BookItem): entry is Part {
  return 'name' in entry
}

export interface BookDivisions {
  frontMatter: BookItem[]
  body: BookItem[]
  bodyKey?: 'body' | 'chapters'
  endMatter: BookItem[]
}

/** The canonical reading order for every feature that consumes a book. */
export function bookSections(book: BookDivisions): BookSectionEntry[] {
  const sections: BookSectionEntry[] = []
  const walk = (items: BookItem[], division: BookDivision, parentPath: (string | number)[], ancestry: BookSectionEntry['ancestry']): void => {
    items.forEach((entry, index) => {
      const path = [...parentPath, index]
      if (!isPart(entry)) {
        sections.push({ entry, division, ancestry, depth: ancestry.length, path, id: entry.id })
        return
      }
      const id = entry.id
      if (entry.html !== undefined || entry.title !== undefined) sections.push({ entry, division, ancestry, depth: ancestry.length, path, id })
      walk(entry.children, division, [...path, 'children'], [...ancestry, { name: entry.name, title: entry.title, id }])
    })
  }
  walk(book.frontMatter, 'front', ['frontMatter'], [])
  walk(book.body, 'body', [book.bodyKey ?? 'body'], [])
  walk(book.endMatter, 'end', ['endMatter'], [])
  return sections
}

export function isBookContents(entry: BookItem): entry is BookContents {
  return 'kind' in entry && entry.kind === 'contents'
}

export function isDesignedSection(entry: BookItem): entry is DesignedSection {
  return 'kind' in entry && entry.kind === 'designed'
}

export function isTemplatedSection(entry: BookItem): entry is TemplatedSection {
  return 'kind' in entry && entry.kind === 'templated'
}

export function isPlacedSection(entry: BookItem): entry is PlacedSection {
  return 'kind' in entry && entry.kind === 'placed'
}

export function flowingSection(entry: BookItem): boolean {
  return !isPart(entry) && !isBookContents(entry) && !isDesignedSection(entry) && !isTemplatedSection(entry) && !isPlacedSection(entry)
}

export function bookSectionOpensFacts(book: BookDivisions): SectionOpensFact[] {
  return bookSections(book).map(({ entry, id, path }) => ({
    id,
    title: entry.title,
    path,
    sequence: path.slice(0, -1).join('.'),
    flowing: flowingSection(entry),
    opens: entry.opens,
    ...('numbering' in entry ? { numbering: entry.numbering } : {}),
    parentRules: entry.parentRules,
    ...('pageGeometry' in entry ? { pageGeometry: entry.pageGeometry } : {}),
  }))
}

export function isChapter(entry: BookChapterEntry): entry is Chapter {
  return !isDesignedSection(entry) && !isTemplatedSection(entry) && !isPlacedSection(entry)
}

interface NamedSection {
  label: string
  path: (string | number)[]
  parentRules?: ParentRules
  legacyParents?: unknown
  templated?: TemplatedSection
}

type Issue = { path: (string | number)[]; message: string }

function pathLabel(path: (string | number)[]): string {
  return path.join('.')
}

function namedSections(book: BookDivisions): NamedSection[] {
  return bookSections(book).map(({ entry, path }): NamedSection => {
    if (isDesignedSection(entry) || isTemplatedSection(entry)) {
      return {
        label: entry.title ?? pathLabel(path),
        path,
        parentRules: entry.parentRules,
        legacyParents: entry.parents,
        templated: isTemplatedSection(entry) ? entry : undefined,
      }
    }
    return { label: entry.title ?? pathLabel(path), path, parentRules: entry.parentRules, legacyParents: entry.parents }
  })
}

function hasKind(book: BookDivisions, match: (entry: BookItem) => boolean): boolean {
  return bookSections(book).some(({ entry }) => match(entry))
}

function namedParentRuleIssues(label: string, path: (string | number)[], rules: ParentRules | undefined, known: Set<string>): Issue[] {
  if (!rules) return []
  return parentRuleIssues(rules, known, [...path, 'parentRules']).map((issue) => ({ ...issue, message: `${label} ${issue.message}` }))
}

function templateListIssues(templates: BookTemplate[], knownParents: Set<string>): Issue[] {
  const issues: Issue[] = []
  const seen = new Set<string>()
  templates.forEach((template, index) => {
    const path = ['templates', index]
    if (!REGION_NAME.test(template.name)) {
      issues.push({
        path: [...path, 'name'],
        message: `template "${template.name}" is not an HTML name token; ${regionNameClear}`,
      })
    }
    if (seen.has(template.name)) {
      issues.push({
        path: [...path, 'name'],
        message: `template "${template.name}" is duplicated; give every template a unique name to clear this refusal`,
      })
    }
    seen.add(template.name)
    if (template.parents !== undefined) {
      issues.push(renamedParentRulesFieldIssue('template field parents', [...path, 'parents']))
    }
    issues.push(...namedParentRuleIssues(`template ${template.name}`, path, template.parentRules, knownParents))
  })
  return issues
}

function templatedPageIssues(section: NamedSection, knownTemplates: Set<string>): Issue[] {
  const entry = section.templated
  if (!entry) return []
  const issues: Issue[] = []
  if (!knownTemplates.has(entry.template)) {
    issues.push({
      path: [...section.path, 'template'],
      message: `section ${section.label} names unknown template "${entry.template}"; add that template or name an existing one to clear this refusal`,
    })
  }
  entry.pages.forEach((page, index) => {
    if (page.template !== undefined && !knownTemplates.has(page.template)) {
      issues.push({
        path: [...section.path, 'pages', index, 'template'],
        message: `section ${section.label} page ${index + 1} names unknown template "${page.template}"; add that template or name an existing one to clear this refusal`,
      })
    }
    for (const key of Object.keys(page.regions)) {
      if (REGION_NAME.test(key)) continue
      issues.push({
        path: [...section.path, 'pages', index, 'regions', key],
        message: `section ${section.label} page ${index + 1} region "${key}" is not an HTML name token; ${regionNameClear}`,
      })
    }
  })
  return issues
}

export function bookParentIssues(
  book: BookDivisions & {
    mode: 'continuous' | 'paginated'
    parentPages: ParentPage[]
    parentRules?: ParentRules
    templates: BookTemplate[]
  },
): Array<{ path: (string | number)[]; message: string }> {
  const issues: Issue[] = []
  if (book.mode === 'continuous' && hasKind(book, isDesignedSection)) {
    issues.push({
      path: ['mode'],
      message: "designed sections print in paginated mode; set mode: 'paginated' to clear this refusal",
    })
  }
  if (book.mode === 'continuous' && hasKind(book, isTemplatedSection)) {
    issues.push({
      path: ['mode'],
      message: "templated sections print in paginated mode; set mode: 'paginated' to clear this refusal",
    })
  }
  issues.push(
    ...parentListIssues(book.parentPages, {
      path: ['parentPages'],
      known: Object.values(BOOK_PARENT_NAMES),
    }),
  )
  const knownParents = new Set<string>([...Object.values(BOOK_PARENT_NAMES), ...book.parentPages.map((parent) => parent.name)])
  issues.push(...namedParentRuleIssues('book', [], book.parentRules, knownParents))
  issues.push(...templateListIssues(book.templates, knownParents))
  const knownTemplates = new Set(book.templates.map((template) => template.name))
  for (const section of namedSections(book)) {
    if (section.legacyParents !== undefined) {
      issues.push(renamedParentRulesFieldIssue('section or part field parents', [...section.path, 'parents']))
    }
    issues.push(...namedParentRuleIssues(`section ${section.label}`, section.path, section.parentRules, knownParents))
    issues.push(...templatedPageIssues(section, knownTemplates))
  }
  return issues
}
