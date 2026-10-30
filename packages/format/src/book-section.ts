import { z } from 'zod'
import { BOOK_PARENT_NAMES, type ParentPage, parentListIssues } from './printed-pages.ts'

export const BookOpens = z.enum(['recto', 'verso', 'any'])
export type BookOpens = z.infer<typeof BookOpens>

export const BookSectionParents = z.object({
  opener: z.string().min(1).optional(),
  recto: z.string().min(1).optional(),
  verso: z.string().min(1).optional(),
  blank: z.string().min(1).optional(),
  fixed: z.string().min(1).optional(),
})
export type BookSectionParents = z.infer<typeof BookSectionParents>

export const DesignedPage = z.object({ html: z.string() })
export type DesignedPage = z.infer<typeof DesignedPage>

export const REGION_NAME = /^[A-Za-z][\w-]*$/
export const MAX_PART_DEPTH = 6

export const TemplatedPage = z.object({
  template: z.string().min(1).optional(),
  regions: z.record(z.string(), z.string()),
})
export type TemplatedPage = z.infer<typeof TemplatedPage>

export const BookTemplate = z.object({
  name: z.string().min(1),
  html: z.string(),
  parents: BookSectionParents.optional(),
})
export type BookTemplate = z.infer<typeof BookTemplate>

const designedPagesRefusal = 'a designed section needs at least one page; add a page or remove the section to clear this refusal'
const templatedPagesRefusal = 'a templated section needs at least one page; add a page or remove the section to clear this refusal'
const regionNameClear = 'use a letter followed by letters, digits, hyphens or underscores to clear this refusal'

const sectionFields = {
  title: z.string().optional(),
  contents: z.boolean().default(true),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
}

const partFields = {
  name: z.string().regex(REGION_NAME, 'a part name must be an HTML name token'),
  title: z.string().optional(),
  html: z.string().optional(),
  contents: z.boolean().default(true),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
  runningHead: z.string().optional(),
}

export const DesignedSection = z.object({
  kind: z.literal('designed'),
  ...sectionFields,
  pages: z.array(DesignedPage, { error: designedPagesRefusal }).min(1, designedPagesRefusal),
})
export type DesignedSection = z.infer<typeof DesignedSection>

export const TemplatedSection = z.object({
  kind: z.literal('templated'),
  ...sectionFields,
  template: z.string().min(1),
  pages: z.array(TemplatedPage, { error: templatedPagesRefusal }).min(1, templatedPagesRefusal),
})
export type TemplatedSection = z.infer<typeof TemplatedSection>

export const BookSection = z.object({
  html: z.string(),
  ...sectionFields,
})
export type BookSection = z.infer<typeof BookSection>

export const BookContents = z.object({
  kind: z.literal('contents'),
  title: z.string().optional(),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
})
export type BookContents = z.infer<typeof BookContents>

const flowingFront = BookSection.extend({ kind: z.literal('front').optional() })

export const BookFrontMatterEntry = z.discriminatedUnion('kind', [DesignedSection, TemplatedSection, BookContents, flowingFront])
export type BookFrontMatterEntry = z.infer<typeof BookFrontMatterEntry>

export const Chapter = z.object({
  title: z.string(),
  html: z.string(),
  runningHead: z.string().optional(),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
})
export type Chapter = z.infer<typeof Chapter>

const flowingChapter = Chapter.extend({ kind: z.literal('chapter').optional() })

export const BookChapterEntry = z.discriminatedUnion('kind', [DesignedSection, TemplatedSection, flowingChapter])
export type BookChapterEntry = z.infer<typeof BookChapterEntry>

export interface Part extends z.infer<z.ZodObject<typeof partFields>> {
  children: BookItem[]
}

export type BookItem = Part | BookFrontMatterEntry | BookChapterEntry

export const Part: z.ZodType<Part> = z.lazy(() => z.object({ ...partFields, children: z.array(BookItem).default([]) }))
export const BookItem: z.ZodType<BookItem> = z.lazy(() => z.union([Part, BookFrontMatterEntry, BookChapterEntry]))

export type BookDivision = 'front' | 'body' | 'end'

interface BookSectionLocation {
  ancestry: Array<{ name: string; title?: string; runningHead?: string; id: string }>
  depth: number
  path: (string | number)[]
}

export type BookSectionEntry = BookSectionLocation & { entry: BookItem; division: BookDivision; id?: string }

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
  let partNumber = 0
  const walk = (items: BookItem[], division: BookDivision, parentPath: (string | number)[], ancestry: BookSectionEntry['ancestry']): void => {
    items.forEach((entry, index) => {
      const path = [...parentPath, index]
      if (!isPart(entry)) {
        sections.push({ entry, division, ancestry, depth: ancestry.length, path })
        return
      }
      partNumber += 1
      const id = `segnavia-part-${partNumber}`
      if (entry.html !== undefined || entry.title !== undefined) sections.push({ entry, division, ancestry, depth: ancestry.length, path, id })
      walk(entry.children, division, [...path, 'children'], [...ancestry, { name: entry.name, title: entry.title, runningHead: entry.runningHead, id }])
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

export function isChapter(entry: BookChapterEntry): entry is Chapter {
  return !isDesignedSection(entry) && !isTemplatedSection(entry)
}

interface NamedSection {
  label: string
  path: (string | number)[]
  parents?: BookSectionParents
  templated?: TemplatedSection
}

type Issue = { path: (string | number)[]; message: string }

function pathLabel(path: (string | number)[]): string {
  return path.join('.')
}

function namedSections(book: BookDivisions): NamedSection[] {
  return bookSections(book).map(({ entry, path }): NamedSection => {
    if (isDesignedSection(entry) || isTemplatedSection(entry)) {
      return { label: entry.title ?? pathLabel(path), path, parents: entry.parents, templated: isTemplatedSection(entry) ? entry : undefined }
    }
    return { label: entry.title ?? pathLabel(path), path, parents: entry.parents }
  })
}

function hasKind(book: BookDivisions, match: (entry: BookItem) => boolean): boolean {
  return bookSections(book).some(({ entry }) => match(entry))
}

function unknownParent(label: string, role: string, name: string, path: (string | number)[]): Issue {
  return {
    path: [...path, 'parents', role],
    message: `${label} names unknown parent page "${name}"; add that parent page or name an existing one to clear this refusal`,
  }
}

function parentNameIssues(label: string, path: (string | number)[], parents: BookSectionParents | undefined, known: Set<string>): Issue[] {
  if (!parents) return []
  return Object.entries(parents).flatMap(([role, name]) => (name && !known.has(name) ? [unknownParent(label, role, name, path)] : []))
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
    issues.push(...parentNameIssues(`template ${template.name}`, path, template.parents, knownParents))
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
  issues.push(...templateListIssues(book.templates, knownParents))
  const knownTemplates = new Set(book.templates.map((template) => template.name))
  for (const section of namedSections(book)) {
    issues.push(...parentNameIssues(`section ${section.label}`, section.path, section.parents, knownParents))
    issues.push(...templatedPageIssues(section, knownTemplates))
  }
  return issues
}
