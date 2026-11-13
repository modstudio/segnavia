import { type BuiltSection, collectHeadings, sectionHeading } from './book-held.ts'
import type { BookHeading } from './types.ts'

// A section's headings enter the shared headings, which feed both the contents and the PDF outline, only while the section is listed.

interface ChapterHeadingEntry {
  title?: string
  contentsLabel?: string
  subtitle?: string
  contents?: boolean
}

export function withSectionDepth(headings: BookHeading[], depth: number): BookHeading[] {
  return depth > 0 ? headings.map((heading) => ({ ...heading, depth })) : headings
}

export function appendHeldHeadings(entry: { contents?: boolean }, headings: BookHeading[], depth: number, listed: BookHeading[]): void {
  if (entry.contents) listed.push(...withSectionDepth(headings, depth))
}

export function appendChapterHeadings(entry: ChapterHeadingEntry, section: BuiltSection, depth: number, maxHeadingLevel: number, listed: BookHeading[]): void {
  if (entry.contents === false) return
  const title = entry.title === undefined ? [] : [sectionHeading({ ...entry, title: entry.title }, section.info.id)]
  listed.push(...withSectionDepth([...title, ...collectHeadings(section.node.children, section.info.id, maxHeadingLevel, 2)], depth))
}
