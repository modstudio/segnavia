import type { BookSectionEntry } from '@segnavia/format'
import type { DocumentBuild } from './book-document.ts'
import { attachPendingPartHeadings, partNames } from './book-part-build.ts'

export function attachSectionNumber(build: DocumentBuild, id: string): void {
  const heading = [...build.headings].reverse().find((candidate) => candidate.id === id)
  const number = build.structureNumbers.get(id)?.text
  if (heading && number !== undefined) heading.number = number
}

export function decorateSection(sectionEntry: BookSectionEntry, build: DocumentBuild): void {
  const section = build.sections.at(-1)
  if (!section) return
  const number = build.structureNumbers.get(sectionEntry.id)?.text
  if (number !== undefined) {
    section.node.attribs['data-segnavia-section-number'] = number
    section.info.number = number
  }
  if (sectionEntry.ancestry.length > 0) {
    const parts = partNames(sectionEntry.ancestry)
    const partNumbers = Object.fromEntries(
      sectionEntry.ancestry.flatMap((part) => {
        const text = build.structureNumbers.get(part.id)?.text
        return text === undefined ? [] : [[part.name, text]]
      }),
    )
    section.node.attribs['data-segnavia-parts'] = JSON.stringify({
      ...parts,
      ...Object.fromEntries(Object.entries(partNumbers).map(([name, value]) => [`#${name}`, value])),
      ...(number === undefined ? {} : { '#chapter': number }),
    })
    section.info.parts = parts
    if (Object.keys(partNumbers).length > 0) {
      section.node.attribs['data-segnavia-part-numbers'] = JSON.stringify(partNumbers)
      section.info.partNumbers = partNumbers
    }
  }
  attachPendingPartHeadings(build, sectionEntry, section.info.id)
}
