import { type BookItem, bookSections, isBookContents, isPart, MAX_PART_DEPTH } from './book-section.ts'

export type BookStructureIssue = { path: (string | number)[]; message: string }

function partSectionIssues(items: BookItem[], path: (string | number)[]): BookStructureIssue[] {
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

interface BookStructureFacts {
  frontMatter: BookItem[]
  body: BookItem[]
  bodyKey: 'body' | 'chapters'
  endMatter: BookItem[]
}

export function structuralBookIssues(book: BookStructureFacts): BookStructureIssue[] {
  const issues: BookStructureIssue[] = []
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

export function partDepthIssues(value: unknown): BookStructureIssue[] {
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
  const issues: BookStructureIssue[] = []
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
