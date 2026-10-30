import {
  BOOK_FURNITURE,
  type BookSectionParents,
  type BookTemplate,
  type DesignedSection,
  MOTIF_ATTRIBUTE,
  motifFieldAttribute,
  type ParentPage,
  REGION_NAME,
  type TemplatedSection,
} from '@segnavia/format'
import type { ChildNode, Element } from 'domhandler'
import { elements, parse } from '../sanitize.ts'
import { type BookFlowPageGeometry, flowPageStyle } from './book-flow.ts'
import { element, linkChildren, textContent } from './dom.ts'
import type { BookBuild, BookHeading, BookSectionInfo } from './types.ts'

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
  build: BookBuild,
  runningHead?: string,
  extra: Record<string, string> = {},
) {
  const attribs: Record<string, string> = { class: `segnavia-section segnavia-${kind}`, id, ...extra }
  if (build !== 'print') attribs['data-segnavia-flow'] = id
  if (build === 'galley' && runningHead !== undefined) attribs['data-running-head'] = runningHead
  return element('section', attribs, children)
}

function flowPage(page: number, kind: 'designed' | 'templated', children: ChildNode[], geometry: BookFlowPageGeometry, recto: boolean) {
  const paper = element('div', { 'data-segnavia-flow-paper': '' }, children)
  return element('figure', { [`data-segnavia-${kind}-page`]: String(page), 'data-segnavia-flow-page': '', style: flowPageStyle(geometry, recto) }, [
    element('div', { 'data-segnavia-flow-page-size': '' }, [paper]),
  ])
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
  build: BookBuild,
  depth: number,
  geometry?: BookFlowPageGeometry,
): { built: BuiltSection; headings: BookHeading[] } {
  const extra = flowAttribs(entry.opens, entry.parents, {
    'data-segnavia-kind': 'fixed',
    ...(kind === 'front' ? { 'data-sequence': 'front' } : {}),
  })
  const headings: BookHeading[] = []
  const generated = { n: 0 }
  const firstRecto = entry.opens !== 'verso'
  const holders = entry.pages.map((page, offset) => {
    const document = parse(page.html)
    headings.push(...heldHeadings(document.children, id, depth, generated))
    return build === 'flow' && geometry
      ? flowPage(offset + 1, 'designed', document.children, geometry, offset % 2 === 0 ? firstRecto : !firstRecto)
      : element('div', { 'data-segnavia-designed-page': String(offset + 1), hidden: '' }, document.children)
  })
  if (entry.contents && entry.title !== undefined) headings.unshift({ id, level: 1, text: entry.title, sectionId: id })
  const runningHead = entry.title
  return {
    built: { info: { id, kind, title: entry.title, runningHead }, node: sectionNode(kind, id, holders, build, runningHead, extra) },
    headings,
  }
}

export function templateRegionElements(html: string): Element[] {
  return elements(parse(html).children).filter((node) => node.attribs['data-region'])
}

function declaredRegions(html: string): Set<string> {
  return new Set(templateRegionElements(html).flatMap((node) => (node.attribs['data-region'] ? [node.attribs['data-region']] : [])))
}

const regionNameClear = 'use a letter followed by letters, digits, hyphens or underscores to clear this refusal'

export function templateRegionNameIssues(template: string, regions: Element[]): string[] {
  return [...new Set(regions.flatMap((node) => (node.attribs['data-region'] ? [node.attribs['data-region']] : [])))].flatMap((key) =>
    REGION_NAME.test(key) ? [] : [`template "${template}" marks region "${key}" which is not an HTML name token; ${regionNameClear}`],
  )
}

const markFurniture = BOOK_FURNITURE.find((item) => item.key === 'segnavia:mark') as Extract<(typeof BOOK_FURNITURE)[number], { key: 'segnavia:mark' }>
const markFields = new Set(markFurniture.fields.map((field) => motifFieldAttribute(field.key)))
const allowedMarkFields = markFurniture.fields.map((field) => field.key).join(' and ')

function markNodeIssues(parent: ParentPage, node: Element): string[] {
  if (node.attribs[MOTIF_ATTRIBUTE] !== markFurniture.key) return []
  const issues = Object.keys(node.attribs)
    .filter((attribute) => attribute.startsWith(`${MOTIF_ATTRIBUTE}-`) && !markFields.has(attribute))
    .map((attribute) => {
      const field = attribute.slice(`${MOTIF_ATTRIBUTE}-`.length)
      return `parent page "${parent.name}" mark has unknown field "${field}"; use only ${allowedMarkFields} to clear this refusal`
    })
  for (const field of markFurniture.fields) {
    const attribute = motifFieldAttribute(field.key)
    const supplied = node.attribs[attribute]
    const value = supplied ?? ('default' in field ? field.default : undefined)
    if ('required' in field && field.required && (value === undefined || value.trim() === '')) {
      issues.push(
        `parent page "${parent.name}" mark has an empty ${field.key}; set a non-empty ${attribute} on the segnavia:mark placement to clear this refusal`,
      )
    }
    if ('choices' in field && value !== undefined) {
      const choices: readonly string[] = field.choices
      if (!choices.includes(value)) {
        issues.push(`parent page "${parent.name}" mark has unknown ${field.key} value "${value}"; use ${choices.join(' or ')} to clear this refusal`)
      }
    }
  }
  return issues
}

export function markPlacementIssues(parents: ParentPage[]): string[] {
  return parents.flatMap((parent) =>
    (['head', 'foot'] as const).flatMap((region) => {
      const html = parent[region]
      if (html === undefined) return []
      return elements(parse(html).children).flatMap((node) => markNodeIssues(parent, node))
    }),
  )
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
  build: BookBuild,
  depth: number,
  templates?: Map<string, BookTemplate>,
  geometry?: BookFlowPageGeometry,
): { built: BuiltSection; headings: BookHeading[] } {
  const extra = flowAttribs(entry.opens, entry.parents, {
    'data-segnavia-kind': 'templated',
    'data-template': entry.template,
    ...(kind === 'front' ? { 'data-sequence': 'front' } : {}),
  })
  const headings: BookHeading[] = []
  const generated = { n: 0 }
  const firstRecto = entry.opens !== 'verso'
  const holders = entry.pages.map((page, offset) => {
    const name = page.template ?? entry.template
    const regionChildren = new Map<string, ChildNode[]>()
    const regions = Object.entries(page.regions).map(([region, html]) => {
      const document = parse(html)
      headings.push(...heldHeadings(document.children, id, depth, generated))
      regionChildren.set(region, document.children)
      return element('div', { 'data-region': region, hidden: '' }, document.children)
    })
    if (build === 'flow' && geometry) {
      const template = templates?.get(name)
      const document = parse(template?.html ?? '')
      for (const [region, children] of regionChildren) {
        const target = elements(document.children).find((node) => node.attribs['data-region'] === region)
        if (!target) continue
        target.children = children
        linkChildren(target)
      }
      const text = element('div', { 'data-segnavia-flow-text': '', 'data-template': name }, document.children)
      return flowPage(offset + 1, 'templated', [text], geometry, offset % 2 === 0 ? firstRecto : !firstRecto)
    }
    return element('div', { 'data-segnavia-templated-page': String(offset + 1), 'data-template': name, hidden: '' }, regions)
  })
  if (entry.contents && entry.title !== undefined) headings.unshift({ id, level: 1, text: entry.title, sectionId: id })
  const runningHead = entry.title
  return {
    built: { info: { id, kind, title: entry.title, runningHead }, node: sectionNode(kind, id, holders, build, runningHead, extra) },
    headings,
  }
}

export function templateHolders(templates: BookTemplate[]): ReturnType<typeof element>[] {
  return templates.map((template) =>
    element('div', { 'data-segnavia-template': template.name, hidden: '', ...flowAttribs(undefined, template.parents) }, parse(template.html).children),
  )
}
