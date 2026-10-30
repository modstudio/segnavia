import { type bookSections, isPart } from '@segnavia/format'
import type { DocumentBuild } from './book-document.ts'
import { partSection } from './book-held.ts'
import { element, linkChildren } from './dom.ts'

export function addPart(sectionEntry: ReturnType<typeof bookSections>[number], build: DocumentBuild): boolean {
  const { entry } = sectionEntry
  if (!isPart(entry)) return false
  const id = sectionEntry.id ?? ''
  if (entry.html !== undefined) {
    const parts = Object.fromEntries(sectionEntry.ancestry.map((part) => [part.name, part.title ?? '']))
    build.sections.push(partSection(entry, id, sectionEntry.division, build.build, parts))
    attachPendingParts(build)
  } else {
    build.pendingPartIds.push(id)
  }
  if (entry.contents && entry.title !== undefined) {
    build.headings.push({ id, level: 1, depth: sectionEntry.depth, text: entry.title, sectionId: id })
  }
  return true
}

export function attachPendingParts(build: DocumentBuild): void {
  const section = build.sections.at(-1)
  if (!section || build.pendingPartIds.length === 0) return
  section.node.children.unshift(...build.pendingPartIds.map((id) => element('span', { id, hidden: '' })))
  linkChildren(section.node)
  build.pendingPartIds = []
}
