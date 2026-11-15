import { type BookDivisions, type BookSectionEntry, bookSections, isBookContents, isPart } from './book-section.ts'
import { numberSystemMaximum, type NumberSystem } from './numbering.ts'
import { type StructureNumberSettings, structureNumberStyle } from './structure-numbers.ts'

export interface StructureNumberingIssue {
  path: (string | number)[]
  message: string
}

function isChapter(section: BookSectionEntry): boolean {
  if (section.division !== 'body' || isPart(section.entry) || isBookContents(section.entry)) return false
  return !('record' in section.entry && section.entry.record !== undefined)
}

function issue(path: (string | number)[], node: string, field: string, value: number, style: NumberSystem, maximum: number): StructureNumberingIssue {
  return {
    path,
    message: `${node} at ${path.slice(0, -1).join('.')} sets ${field} ${value}, outside the ${style} maximum ${maximum}; set ${field} to at most ${maximum} or change its effective style to clear this refusal`,
  }
}

export function structureNumberingIssues(
  book: BookDivisions,
  settings: StructureNumberSettings,
): StructureNumberingIssue[] {
  const issues: StructureNumberingIssue[] = []
  const parts: BookSectionEntry[] = []
  const collectParts = (
    items: BookDivisions['body'],
    division: BookSectionEntry['division'],
    parentPath: (string | number)[],
    ancestry: BookSectionEntry['ancestry'],
  ): void => {
    items.forEach((entry, index) => {
      if (!isPart(entry)) return
      const path = [...parentPath, index]
      parts.push({ entry, division, path, ancestry, depth: ancestry.length, id: entry.id })
      collectParts(entry.children, division, [...path, 'children'], [
        ...ancestry,
        { name: entry.name, title: entry.title, id: entry.id, number: entry.number, numbering: entry.numbering },
      ])
    })
  }
  collectParts(book.frontMatter, 'front', ['frontMatter'], [])
  collectParts(book.body, 'body', [book.bodyKey ?? 'body'], [])
  collectParts(book.endMatter, 'end', ['endMatter'], [])

  for (const section of parts) {
    const entry = section.entry
    if (!isPart(entry)) continue
    if (typeof entry.number === 'number') {
      const style = structureNumberStyle(section, 'part', settings)
      const maximum = numberSystemMaximum(style)
      if (maximum !== undefined && entry.number > maximum) {
        issues.push(issue([...section.path, 'number'], `part ${JSON.stringify(entry.title ?? section.id)}`, 'number', entry.number, style, maximum))
      }
    }
    if (entry.numbering === undefined) continue
    for (const restartLevel of ['parts', 'chapters'] as const) {
      const restart = entry.numbering[restartLevel]?.restart
      if (restart === undefined) continue
      const descendant = { ...section, ancestry: [...section.ancestry, { ...entry, id: section.id }] }
      const style = structureNumberStyle(descendant, restartLevel === 'parts' ? 'part' : 'chapter', settings)
      const maximum = numberSystemMaximum(style)
      if (maximum !== undefined && restart > maximum) {
        issues.push(
          issue(
            [...section.path, 'numbering', restartLevel, 'restart'],
            `part ${JSON.stringify(entry.title ?? section.id)}`,
            `${restartLevel} restart`,
            restart,
            style,
            maximum,
          ),
        )
      }
    }
  }
  for (const section of bookSections(book)) {
    if (!isChapter(section)) continue
    const entry = section.entry as BookSectionEntry['entry'] & { number?: string | number | false }
    if (typeof entry.number !== 'number') continue
    const style = structureNumberStyle(section, 'chapter', settings)
    const maximum = numberSystemMaximum(style)
    if (maximum !== undefined && entry.number > maximum) {
      issues.push(issue([...section.path, 'number'], `chapter ${JSON.stringify(entry.title ?? section.id)}`, 'number', entry.number, style, maximum))
    }
  }
  return issues
}
