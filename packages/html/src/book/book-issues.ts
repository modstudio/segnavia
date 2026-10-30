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

function sectionIds(section: BuiltSection): string[] {
  return [section.info.id, ...elements(section.node.children).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))]
}

function sectionName(section: BuiltSection): string {
  return `${section.info.title ?? section.info.id} (${section.info.id})`
}

export function pageReferenceIssues(sections: BuiltSection[]): string[] {
  const targets = new Map<string, BuiltSection[]>()
  for (const section of sections) {
    for (const id of sectionIds(section)) targets.set(id, [...(targets.get(id) ?? []), section])
  }
  const referenced = new Set(
    sections.flatMap((section) =>
      elements(section.node.children).flatMap((node) => {
        if (node.name !== 'a' || node.attribs['data-ref'] !== 'page') return []
        const href = node.attribs.href
        return href?.startsWith('#') && href.length > 1 ? [href.slice(1)] : []
      }),
    ),
  )
  return [...referenced].flatMap((id) => {
    const owners = targets.get(id) ?? []
    if (owners.length === 0) return [`page reference target ${id} does not exist; add id="${id}" to its destination to clear this refusal`]
    if (owners.length === 1) return []
    return [
      `page reference target ${id} is used in both ${sectionName(owners[0] as BuiltSection)} and ${sectionName(owners[1] as BuiltSection)}; make the target id unique to clear this refusal`,
    ]
  })
}

export function reservedIdIssues(section: BuiltSection): string[] {
  return elements(section.node.children).flatMap((node) => {
    const id = node.attribs.id
    if (!id?.startsWith('segnavia-')) return []
    return [`authored id ${id} in ${section.info.title ?? section.info.id} (${section.info.id}) uses the reserved segnavia- prefix`]
  })
}
