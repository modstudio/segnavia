import { type bookSections, isPart } from '@segnavia/format'
import type { DocumentBuild } from './book-document.ts'
import { partSection } from './book-held.ts'

export function addPart(sectionEntry: ReturnType<typeof bookSections>[number], build: DocumentBuild): boolean {
  const { entry } = sectionEntry
  if (!isPart(entry)) return false
  const id = sectionEntry.id ?? ''
  if (entry.html !== undefined) {
    const parts = Object.fromEntries(sectionEntry.ancestry.map((part) => [part.name, part.title ?? '']))
    build.sections.push(partSection(entry, id, sectionEntry.division, build.build, parts))
    attachPendingPartHeadings(build, id)
  }
  if (entry.contents && entry.title !== undefined) {
    const heading = { level: 1, depth: sectionEntry.depth, text: entry.title }
    if (entry.html === undefined) build.pendingPartHeadings.push(heading)
    else build.headings.push({ ...heading, id, sectionId: id })
  }
  return true
}

export function attachPendingPartHeadings(build: DocumentBuild, id: string): void {
  build.headings.push(...build.pendingPartHeadings.map((heading) => ({ ...heading, id, sectionId: id })))
  build.pendingPartHeadings = []
}
