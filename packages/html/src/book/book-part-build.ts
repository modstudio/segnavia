import { type BookSectionEntry, isPart } from '@segnavia/format'
import type { DocumentBuild } from './book-document.ts'
import { partSection } from './book-held.ts'

type PartFact = BookSectionEntry['ancestry'][number]

export function partNames(ancestry: PartFact[], own?: PartFact): Record<string, string> {
  return Object.fromEntries([...ancestry, ...(own ? [own] : [])].map((part) => [part.name, part.runningHead ?? part.title ?? '']))
}

export function addPart(sectionEntry: BookSectionEntry, build: DocumentBuild): boolean {
  const { entry } = sectionEntry
  if (!isPart(entry)) return false
  const id = sectionEntry.id ?? ''
  if (entry.html !== undefined) {
    const parts = partNames(sectionEntry.ancestry, { name: entry.name, title: entry.title, runningHead: entry.runningHead, id })
    build.sections.push(partSection(entry, id, sectionEntry.division, build.build, parts))
    attachPendingPartHeadings(build, sectionEntry, id)
  }
  if (entry.contents && entry.title !== undefined) {
    const heading = { level: 1, depth: sectionEntry.depth, text: entry.title }
    if (entry.html === undefined) build.pendingPartHeadings.push({ ...heading, partId: id })
    else build.headings.push({ ...heading, id, sectionId: id })
  }
  return true
}

export function attachPendingPartHeadings(build: DocumentBuild, sectionEntry: BookSectionEntry, id: string): void {
  const ancestryIds = new Set(sectionEntry.ancestry.map((part) => part.id))
  const attached = build.pendingPartHeadings.filter((heading) => ancestryIds.has(heading.partId))
  build.headings.push(...attached.map(({ partId: _partId, ...heading }) => ({ ...heading, id, sectionId: id })))
  build.pendingPartHeadings = build.pendingPartHeadings.filter((heading) => !ancestryIds.has(heading.partId))
}
