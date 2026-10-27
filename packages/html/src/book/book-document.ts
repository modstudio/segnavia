import {
  type Book,
  type BookSection,
  type BookSectionParents,
  type Chapter,
  type DesignedSection,
  isBookContents,
  isDesignedSection,
  noteMarkerIssues,
  resolveDirection,
} from '@segnavia/format'
import { type ChildNode, type Document, isTag } from 'domhandler'
import { elements, parse, serialize } from '../sanitize.ts'
import { element, linkChildren, text, textContent } from './dom.ts'
import { noteState, transformNotes } from './notes.ts'
import { type BookDocument, type BookDocumentOptions, type BookHeading, type BookSectionInfo, bookPrintPart } from './types.ts'

// The front/body selectors here agree with bookPrintPart, the source of print membership.
const CONTENTS_CSS =
  ':where(.segnavia-contents-list){list-style:none;padding:0;margin:0}:where(.segnavia-contents-entry){display:flex}:where(.segnavia-contents-page){margin-inline-start:auto}:where(.segnavia-contents-entry[data-level="2"]){padding-inline-start:1em}:where(.segnavia-contents-entry[data-level="3"]){padding-inline-start:2em}:where(.segnavia-contents-entry[data-level="4"]){padding-inline-start:3em}:where(.segnavia-contents-entry[data-level="5"]){padding-inline-start:4em}:where(.segnavia-contents-entry[data-level="6"]){padding-inline-start:5em}'
const PRINT_CSS = `${CONTENTS_CSS}@media print{:where(.segnavia-front,.segnavia-contents)~:where(.segnavia-front,.segnavia-contents),:where(.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}:where(.segnavia-blank){break-after:page}:where(.segnavia-targets){position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}}`
const GALLEY_CSS = `${CONTENTS_CSS}:where([data-segnavia-galleys]){position:relative}:where([data-segnavia-flow]){orphans:inherit;widows:inherit}:where([data-segnavia-kind="fixed"]){display:none}:where([data-segnavia-notes-galley]){border-block-start:1px solid;padding-block-start:8px}:where([data-segnavia-note]){break-inside:avoid}`

interface BuiltSection {
  info: BookSectionInfo
  node: ReturnType<typeof element>
}

function direction(book: Book, value: string): string {
  return resolveDirection(book.dir, book.lang, value)
}

function flowAttribs(opens?: string, parents?: BookSectionParents, extra: Record<string, string> = {}): Record<string, string> {
  const attribs = { ...extra }
  if (opens) attribs['data-opens'] = opens
  if (!parents) return attribs
  for (const role of ['opener', 'recto', 'verso', 'blank', 'fixed'] as const) {
    const name = parents[role]
    if (name) attribs[`data-parent-${role}`] = name
  }
  return attribs
}

function sectionNode(
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

function authoredSection(section: BookSection, id: string, galley = false): BuiltSection {
  const document = parse(section.html)
  const runningHead = section.title
  const node = sectionNode('front', id, document.children, galley, runningHead, flowAttribs(section.opens, section.parents))
  return { info: { id, kind: 'front', title: section.title, runningHead }, node }
}

function contentsSection(entry: { title?: string; opens?: string; parents?: BookSectionParents }, galley = false): BuiltSection {
  const id = 'segnavia-contents'
  const title = entry.title
  const children = title !== undefined ? [element('h1', { class: 'segnavia-contents-title', dir: 'ltr' }, [text(title)])] : []
  return {
    info: { id, kind: 'contents', title, runningHead: title },
    node: sectionNode('contents', id, children, galley, title, flowAttribs(entry.opens, entry.parents)),
  }
}

function chapterSection(chapter: Chapter, index: number, galley = false): BuiltSection {
  const id = `segnavia-chapter-${index}`
  const document = parse(chapter.html)
  const runningHead = chapter.runningHead ?? chapter.title
  return {
    info: { id, kind: 'chapter', title: chapter.title, runningHead },
    node: sectionNode('chapter', id, document.children, galley, runningHead, flowAttribs(chapter.opens, chapter.parents)),
  }
}

function designedHeadings(children: ChildNode[], sectionId: string, depth: number, generated: { n: number }): BookHeading[] {
  return elements(children).flatMap((heading): BookHeading[] => {
    const match = /^h([1-6])$/.exec(heading.name)
    if (!match || heading.attribs['data-contents'] === 'exclude') return []
    const level = Number(match[1])
    if (level > depth) return []
    generated.n += 1
    const id = heading.attribs.id ?? `segnavia-h-${sectionId.replace(/^segnavia-/, '')}-${generated.n}`
    heading.attribs.id = id
    return [{ id, level, text: textContent(heading, true).replace(/\s+/g, ' ').trim(), sectionId }]
  })
}

function designedSection(
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
    headings.push(...designedHeadings(document.children, id, depth, generated))
    return element('div', { 'data-segnavia-designed-page': String(offset + 1), hidden: '' }, document.children)
  })
  if (entry.contents && entry.title !== undefined) headings.unshift({ id, level: 1, text: entry.title, sectionId: id })
  const runningHead = entry.title
  return {
    built: { info: { id, kind, title: entry.title, runningHead }, node: sectionNode(kind, id, holders, galley, runningHead, extra) },
    headings,
  }
}

function appendDesigned(
  entry: DesignedSection,
  id: string,
  kind: 'front' | 'designed',
  book: Book,
  galley: boolean,
  notes: ReturnType<typeof noteState>,
  sections: BuiltSection[],
  headings: BookHeading[],
  issues: string[],
) {
  const held = designedSection(entry, id, kind, galley, book.contents.depth)
  sections.push(held.built)
  issues.push(...reservedIdIssues(held.built), ...columnIssues(held.built))
  headings.push(...held.headings)
  transformNotes(held.built.node, book, 0, notes, galley)
}

function chapterHeadings(section: BuiltSection, chapter: number, depth: number): BookHeading[] {
  let generated = 0
  return elements(section.node.children).flatMap((heading): BookHeading[] => {
    const match = /^h([2-6])$/.exec(heading.name)
    if (!match || heading.attribs['data-contents'] === 'exclude') return []
    const level = Number(match[1])
    if (level > depth) return []
    generated += 1
    const id = heading.attribs.id ?? `segnavia-h-${chapter}-${generated}`
    heading.attribs.id = id
    return [{ id, level, text: textContent(heading, true).replace(/\s+/g, ' ').trim(), sectionId: section.info.id }]
  })
}

function contentsList(book: Book, headings: BookHeading[], options: BookDocumentOptions) {
  const entries = headings.map((heading) => {
    const page = book.contents.pageNumbers ? (options.pageNumbers?.[heading.id] ?? '') : ''
    return element('li', { class: 'segnavia-contents-entry', 'data-level': String(heading.level) }, [
      element('a', { href: options.crossLinks ? `segnavia:target/${heading.id}` : `#${heading.id}`, dir: direction(book, heading.text) }, [text(heading.text)]),
      element('span', { class: 'segnavia-contents-page', 'data-target': heading.id, dir: direction(book, page) }, [text(page)]),
    ])
  })
  return element('ol', { class: 'segnavia-contents-list' }, entries)
}

function addContents(book: Book, section: BuiltSection, headings: BookHeading[], options: BookDocumentOptions): void {
  const title = section.info.title
  const titleNode = section.node.children.find((child) => isTag(child) && child.name === 'h1')
  if (title !== undefined && titleNode && isTag(titleNode)) titleNode.attribs.dir = direction(book, title)
  section.node.children.push(contentsList(book, headings, options))
  linkChildren(section.node)
}

function targetLinks(sections: BuiltSection[]): ReturnType<typeof element> {
  const ids = sections.flatMap((section) => [section.info.id, ...elements(section.node.children).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))])
  return element(
    'div',
    { class: 'segnavia-targets', 'aria-hidden': 'true' },
    [...new Set(ids)].map((id) => element('a', { href: `#${id}` }, [text('\u200b')])),
  )
}

function duplicateIdIssues(sections: BuiltSection[], headings: BookHeading[]): string[] {
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

function reservedIdIssues(section: BuiltSection): string[] {
  return elements(section.node.children).flatMap((node) => {
    const id = node.attribs.id
    if (!id?.startsWith('segnavia-')) return []
    return [`authored id ${id} in ${section.info.title ?? section.info.id} (${section.info.id}) uses the reserved segnavia- prefix`]
  })
}

function columnsValueOk(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false
  const count = Number(value)
  return count >= 2 && count <= 4
}

function columnIssues(section: BuiltSection): string[] {
  const where = `${section.info.title ?? section.info.id} (${section.info.id})`
  return elements(section.node.children).flatMap((node) => {
    const value = node.attribs['data-columns']
    if (value === undefined || columnsValueOk(value)) return []
    return [`The ${node.name} in ${where} could not establish data-columns ${JSON.stringify(value)}; set it to an integer from 2 to 4 to clear this`]
  })
}

function endnotesSection(book: Book, paragraphs: ReturnType<typeof element>[], galley = false): BuiltSection {
  const id = 'segnavia-endnotes'
  const titleValue = book.endnotes.title
  const titleNode = element('h1', { class: 'segnavia-endnotes-title', dir: direction(book, titleValue) }, [text(titleValue)])
  return {
    info: { id, kind: 'endnotes', title: titleValue, runningHead: titleValue },
    node: sectionNode('endnotes', id, [titleNode, ...paragraphs], galley, titleValue),
  }
}

function notesGalley(paragraphs: ReturnType<typeof element>[]): ReturnType<typeof element> {
  const notes = paragraphs.map((paragraph) => element('div', { 'data-segnavia-note': paragraph.attribs.id ?? '' }, [paragraph]))
  return element('aside', { 'data-segnavia-notes-galley': '', 'aria-hidden': 'true' }, notes)
}

function withBlankPages(sections: BuiltSection[], blankBefore: string[] | undefined): ChildNode[] {
  const counts = new Map<string, number>()
  for (const id of blankBefore ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
  return sections.flatMap((section): ChildNode[] => [
    ...Array.from({ length: counts.get(section.info.id) ?? 0 }, () => element('div', { class: 'segnavia-blank', 'aria-hidden': 'true' })),
    section.node,
  ])
}

export function bookDocument(book: Book, options: BookDocumentOptions = {}): BookDocument {
  const galley = book.mode === 'paginated'
  const notes = noteState()
  const sections: BuiltSection[] = []
  const headings: BookHeading[] = []
  const issues: string[] = []
  let frontNumber = 0
  let chapterNumber = 0
  let designedNumber = 0
  let contents: BuiltSection | undefined

  for (const entry of book.frontMatter) {
    if (isBookContents(entry)) {
      contents = contentsSection(entry, galley)
      sections.push(contents)
      continue
    }
    if (isDesignedSection(entry)) {
      designedNumber += 1
      appendDesigned(entry, `segnavia-designed-${designedNumber}`, 'front', book, galley, notes, sections, headings, issues)
      continue
    }
    frontNumber += 1
    const section = authoredSection(entry, `segnavia-front-${frontNumber}`, galley)
    sections.push(section)
    issues.push(...reservedIdIssues(section), ...columnIssues(section))
    if (entry.contents && entry.title !== undefined) headings.push({ id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id })
    transformNotes(section.node, book, 0, notes, galley)
  }

  for (const entry of book.chapters) {
    if (isDesignedSection(entry)) {
      designedNumber += 1
      appendDesigned(entry, `segnavia-designed-${designedNumber}`, 'designed', book, galley, notes, sections, headings, issues)
      continue
    }
    chapterNumber += 1
    const section = chapterSection(entry, chapterNumber, galley)
    sections.push(section)
    issues.push(...reservedIdIssues(section), ...columnIssues(section))
    headings.push(
      { id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id },
      ...chapterHeadings(section, chapterNumber, book.contents.depth),
    )
    transformNotes(section.node, book, chapterNumber, notes, galley)
  }

  if (notes.endnotes) sections.push(endnotesSection(book, notes.endnoteParagraphs, galley))
  if (book.endnotes.placement === 'chapter') {
    issues.push('chapter endnotes are not supported yet in paginated mode; use book placement to clear this refusal')
  }
  if (contents) addContents(book, contents, headings, options)

  const visible = sections.filter((section) => options.part === undefined || bookPrintPart(section.info.kind) === options.part)
  const document = parse('') as Document
  document.children = galley
    ? [
        element('style', {}, [text(GALLEY_CSS)]),
        element('div', { 'data-segnavia-galleys': '' }, [
          ...visible.map((section) => section.node),
          ...(notes.footnoteParagraphs.length > 0 ? [notesGalley(notes.footnoteParagraphs)] : []),
        ]),
      ]
    : [element('style', {}, [text(PRINT_CSS)]), ...(options.targets ? [targetLinks(visible)] : []), ...withBlankPages(visible, options.blankBefore)]
  linkChildren(document)
  return {
    html: serialize(document),
    sections: sections.map((section) => section.info),
    headings,
    issues: [...noteMarkerIssues(book, { footnotes: notes.footnotes, endnotes: notes.endnotes }), ...issues, ...duplicateIdIssues(sections, headings)],
  }
}
