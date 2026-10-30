import type { Element } from 'domhandler'
import { elements } from '../sanitize.ts'
import type { BuiltSection } from './book-held.ts'
import { pageReferenceNodes, pageReferenceTarget } from './book-page-reference.ts'
import type { BookHeading, BookSectionInfo } from './types.ts'

function sectionIds(section: BuiltSection): string[] {
  return [section.info.id, ...elements(section.node.children).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))]
}

function sectionName(section: BookSectionInfo): string {
  return `${section.title ?? section.id} (${section.id})`
}

function ownersById(sections: BuiltSection[]): Map<string, BookSectionInfo[]> {
  const occurrences = new Map<string, BookSectionInfo[]>()
  for (const section of sections) for (const id of sectionIds(section)) occurrences.set(id, [...(occurrences.get(id) ?? []), section.info])
  return occurrences
}

export function duplicateIdIssues(sections: BuiltSection[], headings: BookHeading[]): string[] {
  const listed = new Set(headings.map((heading) => heading.id))
  return [...ownersById(sections)].flatMap(([id, owners]) => {
    if (!listed.has(id) || owners.length < 2) return []
    const named = owners.slice(0, 2).map(sectionName)
    return [`destination id ${id} is used in both ${named[0]} and ${named[1]}; listed heading and generated destination ids must be unique`]
  })
}

export interface PageReferenceScope {
  owner: string
  roots: Element[]
}

export function pageReferenceIssues(sections: BuiltSection[], scopes: PageReferenceScope[]): string[] {
  const targets = ownersById(sections)
  return scopes.flatMap((scope) =>
    pageReferenceNodes(scope.roots).flatMap((node) => {
      const id = pageReferenceTarget(node.attribs)
      if (!id) return []
      const owners = targets.get(id) ?? []
      if (owners.length === 0) return [`page reference to ${id} in ${scope.owner} has no target; add the id or remove the reference`]
      if (owners.length === 1) return []
      return [
        `page reference target ${id} is used in ${owners.length} sections: ${owners.map(sectionName).join(', ')}; make the target id unique to clear this refusal`,
      ]
    }),
  )
}

export function reservedIdIssues(section: BuiltSection): string[] {
  return elements(section.node.children).flatMap((node) => {
    const id = node.attribs.id
    if (!id?.startsWith('segnavia-')) return []
    return [`authored id ${id} in ${sectionName(section.info)} uses the reserved segnavia- prefix`]
  })
}
