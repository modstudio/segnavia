import type { BookSectionParents, BookTemplate, DesignedSection, TemplatedSection } from '@segnavia/format'
import type { ChildNode } from 'domhandler'
import { elements, parse } from '../sanitize.ts'
import { element, textContent } from './dom.ts'
import type { BookHeading, BookSectionInfo } from './types.ts'

export interface BuiltSection {
  info: BookSectionInfo
  node: ReturnType<typeof element>
}

export function flowAttribs(opens?: string, parents?: BookSectionParents, extra: Record<string, string> = {}): Record<string, string> {
  const attribs = { ...extra }
  if (opens) attribs['data-opens'] = opens
  if (!parents) return attribs
  for (const role of ['opener', 'recto', 'verso', 'blank', 'fixed'] as const) {
    const name = parents[role]
    if (name) attribs[`data-parent-${role}`] = name
  }
  return attribs
}

export function sectionNode(
  kind: BookSectionInfo['kind'],
  id: string,
  children: ChildNode[] = [],
  galley = false,
  runningHead?: string,
  extra: Record<string, string> = {},
) {
  const attribs: Record<string, string> = { class: `segnavia-section segnavia-${kind}`, id, ...extra }
  if (galley) attribs['data-segnavia-flow'] = id
  if (galley && runningHead !== undefined) attribs['data-running-head'] = runningHead
  return element('section', attribs, children)
}

export function collectHeadings(
  children: ChildNode[],
  sectionId: string,
  depth: number,
  firstLevel: number,
  idFor: (n: number) => string,
  generated: { n: number },
): BookHeading[] {
  return elements(children).flatMap((heading): BookHeading[] => {
    const match = /^h([1-6])$/.exec(heading.name)
    if (!match || heading.attribs['data-contents'] === 'exclude') return []
    const level = Number(match[1])
    if (level < firstLevel || level > depth) return []
    generated.n += 1
    const id = heading.attribs.id ?? idFor(generated.n)
    heading.attribs.id = id
    return [{ id, level, text: textContent(heading, true).replace(/\s+/g, ' ').trim(), sectionId }]
  })
}

function heldHeadings(children: ChildNode[], sectionId: string, depth: number, generated: { n: number }): BookHeading[] {
  return collectHeadings(children, sectionId, depth, 1, (n) => `segnavia-h-${sectionId.replace(/^segnavia-/, '')}-${n}`, generated)
}

export function designedSection(
  entry: DesignedSection,
  id: string,
  kind: 'front' | 'designed',
  galley: boolean,
  depth: number,
): { built: BuiltSection; headings: BookHeading[] } {
  const extra = flowAttribs(entry.opens, entry.parents, {
    'data-segnavia-kind': 'fixed',
    ...(kind === 'front' ? { 'data-sequence': 'front' } : {}),
  })
  const headings: BookHeading[] = []
  const generated = { n: 0 }
  const holders = entry.pages.map((page, offset) => {
    const document = parse(page.html)
    headings.push(...heldHeadings(document.children, id, depth, generated))
    return element('div', { 'data-segnavia-designed-page': String(offset + 1), hidden: '' }, document.children)
  })
  if (entry.contents && entry.title !== undefined) headings.unshift({ id, level: 1, text: entry.title, sectionId: id })
  const runningHead = entry.title
  return {
    built: { info: { id, kind, title: entry.title, runningHead }, node: sectionNode(kind, id, holders, galley, runningHead, extra) },
    headings,
  }
}

function declaredRegions(html: string): Set<string> {
  return new Set(elements(parse(html).children).flatMap((node) => (node.attribs['data-region'] ? [node.attribs['data-region']] : [])))
}

export function undeclaredRegionIssues(entry: TemplatedSection, id: string, templates: Map<string, BookTemplate>): string[] {
  const label = entry.title ?? id
  return entry.pages.flatMap((page, index) => {
    const name = page.template ?? entry.template
    const template = templates.get(name)
    if (!template) return []
    const declared = declaredRegions(template.html)
    return Object.keys(page.regions).flatMap((region) =>
      declared.has(region)
        ? []
        : [
            `section ${label} page ${index + 1} fills region "${region}" which template "${name}" does not declare; add that region to the template or remove the fill to clear this refusal`,
          ],
    )
  })
}

export function templatedSection(
  entry: TemplatedSection,
  id: string,
  kind: 'front' | 'templated',
  galley: boolean,
  depth: number,
): { built: BuiltSection; headings: BookHeading[] } {
  const extra = flowAttribs(entry.opens, entry.parents, {
    'data-segnavia-kind': 'templated',
    'data-template': entry.template,
    ...(kind === 'front' ? { 'data-sequence': 'front' } : {}),
  })
  const headings: BookHeading[] = []
  const generated = { n: 0 }
  const holders = entry.pages.map((page, offset) => {
    const name = page.template ?? entry.template
    const regions = Object.entries(page.regions).map(([region, html]) => {
      const document = parse(html)
      headings.push(...heldHeadings(document.children, id, depth, generated))
      return element('div', { 'data-region': region, hidden: '' }, document.children)
    })
    return element('div', { 'data-segnavia-templated-page': String(offset + 1), 'data-template': name, hidden: '' }, regions)
  })
  if (entry.contents && entry.title !== undefined) headings.unshift({ id, level: 1, text: entry.title, sectionId: id })
  const runningHead = entry.title
  return {
    built: { info: { id, kind, title: entry.title, runningHead }, node: sectionNode(kind, id, holders, galley, runningHead, extra) },
    headings,
  }
}

export function templateHolders(templates: BookTemplate[]): ReturnType<typeof element>[] {
  return templates.map((template) =>
    element('div', { 'data-segnavia-template': template.name, hidden: '', ...flowAttribs(undefined, template.parents) }, parse(template.html).children),
  )
}
