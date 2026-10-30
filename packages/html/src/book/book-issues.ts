import { elements } from '../sanitize.ts'
import type { BuiltSection } from './book-held.ts'
import type { BookHeading, BookSectionInfo } from './types.ts'

export function duplicateIdIssues(sections: BuiltSection[], headings: BookHeading[]): string[] {
  const listed = new Set(headings.map((heading) => heading.id))
  const occurrences = new Map<string, BookSectionInfo[]>()
  for (const section of sections) {
    const ids = [section.info.id, ...elements(section.node.children).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))]
    for (const id of ids) occurrences.set(id, [...(occurrences.get(id) ?? []), section.info])
  }
  return [...occurrences].flatMap(([id, owners]) => {
    if (!listed.has(id) || owners.length < 2) return []
    const named = owners.slice(0, 2).map((owner) => `${owner.title ?? owner.id} (${owner.id})`)
    return [`destination id ${id} is used in both ${named[0]} and ${named[1]}; listed heading and generated destination ids must be unique`]
  })
}

export function reservedIdIssues(section: BuiltSection): string[] {
  return elements(section.node.children).flatMap((node) => {
    const id = node.attribs.id
    if (!id?.startsWith('segnavia-')) return []
    return [`authored id ${id} in ${section.info.title ?? section.info.id} (${section.info.id}) uses the reserved segnavia- prefix`]
  })
}
