import { type BookDivisions, type BookSectionEntry, bookSections, isBookContents, isPart } from './book-section.ts'
import { type NumberSystem, numberSystemMaximum } from './numbering.ts'
import { type StructureNumberSettings, structureNumberStyle } from './structure-numbers.ts'
import { plainText } from './text-run.ts'

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

type StructureNumberingBook = BookDivisions & {
  lang?: string
  numbering: Pick<StructureNumberSettings, 'parts' | 'chapters'>
}

function partEntries(book: BookDivisions): BookSectionEntry[] {
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
      collectParts(
        entry.children,
        division,
        [...path, 'children'],
        [...ancestry, { name: entry.name, title: entry.title, id: entry.id, number: entry.number, numbering: entry.numbering }],
      )
    })
  }
  collectParts(book.frontMatter, 'front', ['frontMatter'], [])
  collectParts(book.body, 'body', [book.bodyKey ?? 'body'], [])
  collectParts(book.endMatter, 'end', ['endMatter'], [])
  return parts
}

function authoredNumberIssue(section: BookSectionEntry, level: 'part' | 'chapter', settings: StructureNumberSettings): StructureNumberingIssue[] {
  const entry = section.entry as BookSectionEntry['entry'] & { number?: string | number | false }
  if (typeof entry.number !== 'number') return []
  const style = structureNumberStyle(section, level, settings)
  const maximum = numberSystemMaximum(style)
  if (maximum === undefined || entry.number <= maximum) return []
  return [issue([...section.path, 'number'], `${level} ${JSON.stringify(plainText(entry.title) ?? section.id)}`, 'number', entry.number, style, maximum)]
}

function restartIssues(section: BookSectionEntry, settings: StructureNumberSettings): StructureNumberingIssue[] {
  if (!isPart(section.entry) || section.entry.numbering === undefined) return []
  const entry = section.entry
  const descendant = { ...section, ancestry: [...section.ancestry, { ...entry, id: section.id }] }
  return (['parts', 'chapters'] as const).flatMap((level) => {
    const restart = entry.numbering?.[level]?.restart
    if (restart === undefined) return []
    const style = structureNumberStyle(descendant, level === 'parts' ? 'part' : 'chapter', settings)
    const maximum = numberSystemMaximum(style)
    if (maximum === undefined || restart <= maximum) return []
    return [
      issue(
        [...section.path, 'numbering', level, 'restart'],
        `part ${JSON.stringify(plainText(entry.title) ?? section.id)}`,
        `${level} restart`,
        restart,
        style,
        maximum,
      ),
    ]
  })
}

export function structureNumberingIssues(book: StructureNumberingBook): StructureNumberingIssue[] {
  const settings = { lang: book.lang, parts: book.numbering.parts, chapters: book.numbering.chapters }
  const parts = partEntries(book)
  const chapters = bookSections(book).filter(isChapter)
  return [
    ...parts.flatMap((part) => authoredNumberIssue(part, 'part', settings)),
    ...parts.flatMap((part) => restartIssues(part, settings)),
    ...chapters.flatMap((chapter) => authoredNumberIssue(chapter, 'chapter', settings)),
  ]
}
