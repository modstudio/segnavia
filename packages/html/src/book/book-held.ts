import type { ParentRules } from '@segnavia/format'
import {
  type Book,
  type BookSection,
  type BookTemplate,
  type DesignedSection,
  REGION_NAME,
  type RecordFacts,
  type SectionNumbering,
  type TemplatedSection,
} from '@segnavia/format'
import type { ChildNode, Element } from 'domhandler'
import { elements, parse } from '../sanitize.ts'
import { type BookFlowPageGeometry, flowPageStyle } from './book-flow.ts'
import { element, headingText, linkChildren } from './dom.ts'
import { namedRegionFitIssues, templateRegionFitIssues } from './region-fit.ts'
import type { BookBuild, BookHeading, BookSectionInfo } from './types.ts'

export interface BuiltSection {
  info: BookSectionInfo
  node: ReturnType<typeof element>
}

export function authoredSection(
  section: Pick<BookSection, 'html' | 'title' | 'contentsLabel' | 'subtitle' | 'opens' | 'parentRules' | 'numbering' | 'pageGeometry' | 'lang' | 'dir'>,
  id: string,
  build: BookBuild,
): BuiltSection {
  const document = parse(section.html)
  const node = sectionNode(
    'front',
    id,
    document.children,
    build,
    section.title,
    flowAttribs(section.opens, section.parentRules, languageAttribs(section), section.pageGeometry),
  )
  return {
    info: {
      id,
      kind: 'front',
      division: 'front',
      title: section.title,
      opens: section.opens,
      numbering: section.numbering,
      parentRules: section.parentRules,
    },
    node,
  }
}

export function numberingAttribs(numbering?: SectionNumbering): Record<string, string> {
  if (!numbering) return {}
  return {
    ...(numbering.counted === false ? { 'data-numbering-counted': 'false' } : {}),
    ...(numbering.restart === undefined ? {} : { 'data-numbering-restart': String(numbering.restart) }),
  }
}

export function recordAttribs(record?: RecordFacts): Record<string, string> {
  return record ? { 'data-record-index': String(record.index), 'data-record-count': String(record.count) } : {}
}

export function languageAttribs(section: { numbering?: SectionNumbering; lang?: string; dir?: string }): Record<string, string> {
  return {
    ...numberingAttribs(section.numbering),
    ...(section.lang ? { lang: section.lang } : {}),
    ...(section.dir ? { dir: section.dir } : {}),
  }
}

export function flowAttribs(opens?: string, rules?: ParentRules, extra: Record<string, string> = {}, pageGeometry?: string): Record<string, string> {
  const attribs = { ...extra }
  if (opens) attribs['data-opens'] = opens
  if (pageGeometry) attribs['data-page-geometry'] = pageGeometry
  if (rules) attribs['data-segnavia-parent-rules'] = JSON.stringify(rules)
  return attribs
}

export function sectionNode(
  kind: BookSectionInfo['kind'],
  id: string,
  children: ChildNode[] = [],
  build: BookBuild,
  title?: string,
  extra: Record<string, string> = {},
) {
  const attribs: Record<string, string> = { class: `segnavia-section segnavia-${kind}`, id, ...extra }
  if (build !== 'print') attribs['data-segnavia-flow'] = id
  if (build === 'galley' && title !== undefined) attribs['data-segnavia-section-title'] = title
  return element('section', attribs, children)
}

export function partSection(
  entry: Extract<Book['body'][number], { name: string }>,
  id: string,
  division: 'front' | 'body' | 'end',
  build: BookBuild,
  parts: Record<string, string>,
): BuiltSection {
  const children = entry.html === undefined ? [] : parse(entry.html).children
  const extra = flowAttribs(entry.opens, entry.parentRules, {
    'data-segnavia-kind': 'part',
    'data-segnavia-parts': JSON.stringify(parts),
    ...(division === 'front' ? { 'data-sequence': 'front' } : {}),
  })
  return {
    info: { id, kind: 'part', division, title: entry.title, opens: entry.opens, parts, parentRules: entry.parentRules },
    node: sectionNode('part', id, children, build, entry.title, extra),
  }
}

function flowPage(page: number, kind: 'designed' | 'templated', children: ChildNode[], geometry: BookFlowPageGeometry, recto: boolean) {
  const paper = element('div', { 'data-segnavia-flow-paper': '' }, children)
  return element('figure', { [`data-segnavia-${kind}-page`]: String(page), 'data-segnavia-flow-page': '', style: flowPageStyle(geometry, recto) }, [
    element('div', { 'data-segnavia-flow-page-size': '' }, [paper]),
  ])
}

export function collectHeadings(children: ChildNode[], sectionId: string, depth: number, firstLevel: number): BookHeading[] {
  return elements(children).flatMap((heading): BookHeading[] => {
    const match = /^h([1-6])$/.exec(heading.name)
    if (!match || heading.attribs['data-contents'] === 'exclude') return []
    const level = Number(match[1])
    if (level < firstLevel || level > depth) return []
    const id = heading.attribs.id ?? heading.attribs['data-segnavia-id']
    if (!id) {
      throw new Error(
        `heading <${heading.name}> in section "${sectionId}" has no id; pass its Document input through parseDocument from @segnavia/html to clear this refusal`,
      )
    }
    heading.attribs['data-segnavia-id'] ??= id
    heading.attribs.id = id
    return [{ id, level, text: headingText(heading).replace(/\s+/g, ' ').trim(), sectionId }]
  })
}

export function sectionHeading(entry: { title: string; contentsLabel?: string; subtitle?: string }, id: string): BookHeading {
  return {
    id,
    level: 1,
    text: entry.title,
    ...(entry.contentsLabel === undefined ? {} : { contentsLabel: entry.contentsLabel }),
    ...(entry.subtitle === undefined ? {} : { subtitle: entry.subtitle }),
    sectionId: id,
  }
}

function heldHeadings(children: ChildNode[], sectionId: string, depth: number): BookHeading[] {
  return collectHeadings(children, sectionId, depth, 1)
}

export function designedSection(
  entry: DesignedSection,
  id: string,
  kind: 'front' | 'designed',
  division: BookSectionInfo['division'],
  build: BookBuild,
  depth: number,
  geometry?: BookFlowPageGeometry,
): { built: BuiltSection; headings: BookHeading[] } {
  const extra = flowAttribs(
    entry.opens,
    entry.parentRules,
    {
      ...languageAttribs(entry),
      'data-segnavia-kind': 'fixed',
      ...(kind === 'front' ? { 'data-sequence': 'front' } : {}),
    },
    entry.pageGeometry,
  )
  const headings: BookHeading[] = []
  const firstRecto = entry.opens !== 'verso'
  const holders = entry.pages.map((page, offset) => {
    const document = parse(page.html)
    headings.push(...heldHeadings(document.children, id, depth))
    return build === 'flow' && geometry
      ? flowPage(offset + 1, 'designed', document.children, geometry, offset % 2 === 0 ? firstRecto : !firstRecto)
      : element('div', { 'data-segnavia-designed-page': String(offset + 1), hidden: '' }, document.children)
  })
  if (entry.contents && entry.title !== undefined) {
    headings.unshift(sectionHeading({ ...entry, title: entry.title }, id))
  }
  return {
    built: {
      info: { id, kind, division, title: entry.title, opens: entry.opens, numbering: entry.numbering, parentRules: entry.parentRules },
      node: sectionNode(kind, id, holders, build, entry.title, extra),
    },
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

export function templateRegionIssues(templates: BookTemplate[]): string[] {
  return templates.flatMap((template) => {
    const regions = templateRegionElements(template.html)
    return [...templateRegionNameIssues(template.name, regions), ...templateRegionFitIssues(template.name, regions)]
  })
}

function templatedPageRegionFitIssues(entry: TemplatedSection, id: string): string[] {
  const label = entry.title ?? id
  return entry.pages.flatMap((page, index) =>
    Object.values(page.regions).flatMap((html) => namedRegionFitIssues(`section ${label} page ${index + 1}`, templateRegionElements(html))),
  )
}

function undeclaredRegionIssues(entry: TemplatedSection, id: string, templates: Map<string, BookTemplate>): string[] {
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

export function templatedSectionIssues(entry: TemplatedSection, id: string, templates: Map<string, BookTemplate>): string[] {
  return [...undeclaredRegionIssues(entry, id, templates), ...templatedPageRegionFitIssues(entry, id)]
}

export function templatedSection(
  entry: TemplatedSection,
  id: string,
  kind: 'front' | 'templated',
  division: BookSectionInfo['division'],
  build: BookBuild,
  depth: number,
  templates?: Map<string, BookTemplate>,
  geometry?: BookFlowPageGeometry,
): { built: BuiltSection; headings: BookHeading[] } {
  const extra = flowAttribs(
    entry.opens,
    entry.parentRules,
    {
      ...languageAttribs(entry),
      'data-segnavia-kind': 'templated',
      'data-template': entry.template,
      ...(kind === 'front' ? { 'data-sequence': 'front' } : {}),
    },
    entry.pageGeometry,
  )
  const headings: BookHeading[] = []
  const firstRecto = entry.opens !== 'verso'
  const holders = entry.pages.map((page, offset) => {
    const name = page.template ?? entry.template
    const regionChildren = new Map<string, ChildNode[]>()
    const regions = Object.entries(page.regions).map(([region, html]) => {
      const document = parse(html)
      headings.push(...heldHeadings(document.children, id, depth))
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
  if (entry.contents && entry.title !== undefined) {
    headings.unshift(sectionHeading({ ...entry, title: entry.title }, id))
  }
  return {
    built: {
      info: { id, kind, division, title: entry.title, opens: entry.opens, numbering: entry.numbering, parentRules: entry.parentRules },
      node: sectionNode(kind, id, holders, build, entry.title, extra),
    },
    headings,
  }
}

export function templateHolders(templates: BookTemplate[]): ReturnType<typeof element>[] {
  return templates.map((template) =>
    element('div', { 'data-segnavia-template': template.name, hidden: '', ...flowAttribs(undefined, template.parentRules) }, parse(template.html).children),
  )
}
