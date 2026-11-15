import { type BookSectionEntry, DEFAULT_HEADING_LISTING, isPart, type ParentRules } from '@segnavia/format'
import type { DocumentBuild } from './book-document.ts'
import { partSection } from './book-held.ts'

type PartFact = BookSectionEntry['ancestry'][number]

export function partNames(ancestry: PartFact[], own?: PartFact): Record<string, string> {
  return Object.fromEntries([...ancestry, ...(own ? [own] : [])].map((part) => [part.name, part.title ?? '']))
}

export function addPart(sectionEntry: BookSectionEntry, build: DocumentBuild, bookRules?: ParentRules): boolean {
  const { entry } = sectionEntry
  if (!isPart(entry)) return false
  const id = sectionEntry.id ?? ''
  if (entry.html !== undefined) {
    const parts = partNames(sectionEntry.ancestry, { name: entry.name, title: entry.title, id, number: entry.number, numbering: entry.numbering })
    const partNumbers = Object.fromEntries(
      [...sectionEntry.ancestry, { name: entry.name, id }].flatMap((part) => {
        const number = build.structureNumbers.get(part.id)?.text
        return number === undefined ? [] : [[part.name, number]]
      }),
    )
    const section = partSection({ ...entry, parentRules: entry.parentRules ?? bookRules }, id, sectionEntry.division, build.build, parts, partNumbers)
    const number = build.structureNumbers.get(id)?.text
    if (number !== undefined) {
      section.info.number = number
      section.node.attribs['data-segnavia-section-number'] = number
    }
    build.sections.push(section)
    attachPendingPartHeadings(build, sectionEntry, id)
  }
  if (entry.contents && entry.title !== undefined) {
    const number = build.structureNumbers.get(id)?.text
    const heading = {
      level: 1,
      depth: sectionEntry.depth,
      text: entry.title,
      ...(entry.contentsLabel === undefined ? {} : { contentsLabel: entry.contentsLabel }),
      ...(number === undefined ? {} : { number }),
    }
    if (entry.html === undefined) build.pendingPartHeadings.push({ ...heading, partId: id })
    else build.headings.push({ ...heading, id, block: id, sectionId: id, listed: DEFAULT_HEADING_LISTING })
  }
  return true
}

export function attachPendingPartHeadings(build: DocumentBuild, sectionEntry: BookSectionEntry, id: string): void {
  const ancestryIds = new Set(sectionEntry.ancestry.map((part) => part.id))
  const attached = build.pendingPartHeadings.filter((heading) => ancestryIds.has(heading.partId))
  build.headings.push(...attached.map(({ partId: _partId, ...heading }) => ({ ...heading, id, block: id, sectionId: id, listed: DEFAULT_HEADING_LISTING })))
  build.pendingPartHeadings = build.pendingPartHeadings.filter((heading) => !ancestryIds.has(heading.partId))
}
