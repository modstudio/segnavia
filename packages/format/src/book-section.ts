import { z } from 'zod'
import { BOOK_PARENT_NAMES, ParentPage, printedPagesIssues } from './printed-pages.ts'

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

const sectionFields = {
  title: z.string().optional(),
  contents: z.boolean().default(true),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
}

export const DesignedSection = z.object({
  kind: z.literal('designed'),
  ...sectionFields,
  pages: z.array(DesignedPage),
})
export type DesignedSection = z.infer<typeof DesignedSection>

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

export const BookFrontMatterEntry = z.union([DesignedSection, BookContents, BookSection])
export type BookFrontMatterEntry = z.infer<typeof BookFrontMatterEntry>

export const Chapter = z.object({
  title: z.string(),
  html: z.string(),
  runningHead: z.string().optional(),
  opens: BookOpens.optional(),
  parents: BookSectionParents.optional(),
})
export type Chapter = z.infer<typeof Chapter>

export const BookChapterEntry = z.union([DesignedSection, Chapter])
export type BookChapterEntry = z.infer<typeof BookChapterEntry>

export function isBookContents(entry: BookFrontMatterEntry): entry is BookContents {
  return 'kind' in entry && entry.kind === 'contents'
}

export function isDesignedSection(entry: BookFrontMatterEntry | BookChapterEntry): entry is DesignedSection {
  return 'kind' in entry && entry.kind === 'designed'
}

export function isChapter(entry: BookChapterEntry): entry is Chapter {
  return !isDesignedSection(entry)
}

interface NamedSection {
  label: string
  path: (string | number)[]
  parents?: BookSectionParents
}

function namedSections(book: {
  frontMatter: BookFrontMatterEntry[]
  chapters: BookChapterEntry[]
}): NamedSection[] {
  const front = book.frontMatter.map((entry, index): NamedSection => {
    const path = ['frontMatter', index]
    if (isBookContents(entry)) return { label: entry.title ?? `frontMatter[${index}]`, path, parents: entry.parents }
    if (isDesignedSection(entry)) return { label: entry.title ?? `frontMatter[${index}]`, path, parents: entry.parents }
    return { label: entry.title ?? `frontMatter[${index}]`, path, parents: entry.parents }
  })
  const chapters = book.chapters.map((entry, index): NamedSection => {
    const path = ['chapters', index]
    if (isDesignedSection(entry)) return { label: entry.title ?? `chapters[${index}]`, path, parents: entry.parents }
    return { label: entry.title, path, parents: entry.parents }
  })
  return [...front, ...chapters]
}

function hasDesignedSection(book: { frontMatter: BookFrontMatterEntry[]; chapters: BookChapterEntry[] }): boolean {
  return book.frontMatter.some(isDesignedSection) || book.chapters.some(isDesignedSection)
}

export function bookParentIssues(book: {
  mode: 'continuous' | 'paginated'
  parentPages: ParentPage[]
  frontMatter: BookFrontMatterEntry[]
  chapters: BookChapterEntry[]
}): Array<{ path: (string | number)[]; message: string }> {
  const issues: Array<{ path: (string | number)[]; message: string }> = []
  if (book.mode === 'continuous' && hasDesignedSection(book)) {
    issues.push({
      path: ['mode'],
      message: "designed sections print in paginated mode; set mode: 'paginated' to clear this refusal",
    })
  }
  const defaults = Object.values(BOOK_PARENT_NAMES).map((name) => ({ name }))
  for (const issue of printedPagesIssues({ parents: [...defaults, ...book.parentPages], rules: { every: BOOK_PARENT_NAMES.recto } })) {
    if (issue.path[0] === 'rules') continue
    if (issue.path[0] === 'parents' && typeof issue.path[1] === 'number' && issue.path[1] < defaults.length) continue
    const path = issue.path[0] === 'parents' && typeof issue.path[1] === 'number' ? ['parentPages', issue.path[1] - defaults.length, ...issue.path.slice(2)] : issue.path
    issues.push({ path, message: issue.message })
  }
  const known = new Set<string>([...Object.values(BOOK_PARENT_NAMES), ...book.parentPages.map((parent) => parent.name)])
  for (const section of namedSections(book)) {
    if (!section.parents) continue
    for (const [role, name] of Object.entries(section.parents)) {
      if (!name || known.has(name)) continue
      issues.push({
        path: [...section.path, 'parents', role],
        message: `section ${section.label} names unknown parent page "${name}"; add that parent page or name an existing one to clear this refusal`,
      })
    }
  }
  return issues
}
