import { type Book, type BookSection, noteMarkerIssues, resolveDirection } from '@segnavia/format'
import { type ChildNode, type Document, isTag } from 'domhandler'
import { parse, serialize } from '../sanitize.ts'
import { descendants, element, linkChildren, text, textContent } from './dom.ts'
import { noteState, transformNotes } from './notes.ts'
import type { BookDocument, BookDocumentOptions, BookHeading, BookSectionInfo } from './types.ts'

const PRINT_CSS = '@media print{:where(.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}:where(.segnavia-blank){break-after:page}}'

interface BuiltSection {
  info: BookSectionInfo
  node: ReturnType<typeof element>
}

function direction(book: Book, value: string): string {
  return resolveDirection(book.dir, book.lang, value)
}

function sectionNode(kind: BookSectionInfo['kind'], id: string, children: ChildNode[] = []) {
  return element('section', { class: `segnavia-section segnavia-${kind}`, id }, children)
}

function authoredSection(section: BookSection, id: string): BuiltSection {
  const document = parse(section.html)
  const node = sectionNode('front', id, document.children)
  return { info: { id, kind: 'front', title: section.title, runningHead: section.title }, node }
}

function contentsSection(title: string | undefined): BuiltSection {
  const id = 'segnavia-contents'
  const children = title !== undefined ? [element('h1', { class: 'segnavia-contents-title', dir: 'ltr' }, [text(title)])] : []
  return { info: { id, kind: 'contents', title, runningHead: title }, node: sectionNode('contents', id, children) }
}

function chapterSection(chapter: Book['chapters'][number], index: number): BuiltSection {
  const id = `segnavia-chapter-${index}`
  const document = parse(chapter.html)
  return {
    info: { id, kind: 'chapter', title: chapter.title, runningHead: chapter.runningHead ?? chapter.title },
    node: sectionNode('chapter', id, document.children),
  }
}

function chapterHeadings(section: BuiltSection, chapter: number, depth: number): BookHeading[] {
  let generated = 0
  return descendants(section.node.children).flatMap((heading): BookHeading[] => {
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

function contentsList(book: Book, headings: BookHeading[], pageNumbers: Record<string, string> | undefined) {
  const entries = headings.map((heading) => {
    const page = book.contents.pageNumbers ? (pageNumbers?.[heading.id] ?? '') : ''
    return element('li', { class: 'segnavia-contents-entry', 'data-level': String(heading.level) }, [
      element('a', { href: `#${heading.id}`, dir: direction(book, heading.text) }, [text(heading.text)]),
      element('span', { class: 'segnavia-contents-page', 'data-target': heading.id, dir: direction(book, page) }, [text(page)]),
    ])
  })
  return element('ol', { class: 'segnavia-contents-list' }, entries)
}

function addContents(book: Book, section: BuiltSection, headings: BookHeading[], options: BookDocumentOptions): void {
  const title = section.info.title
  const titleNode = section.node.children.find((child) => isTag(child) && child.name === 'h1')
  if (title !== undefined && titleNode && isTag(titleNode)) titleNode.attribs.dir = direction(book, title)
  section.node.children.push(contentsList(book, headings, options.pageNumbers))
  linkChildren(section.node)
}

function endnotesSection(book: Book, paragraphs: ReturnType<typeof element>[]): BuiltSection {
  const id = 'segnavia-endnotes'
  const titleValue = book.endnotes.title
  const titleNode = element('h1', { class: 'segnavia-endnotes-title', dir: direction(book, titleValue) }, [text(titleValue)])
  return {
    info: { id, kind: 'endnotes', title: titleValue, runningHead: titleValue },
    node: sectionNode('endnotes', id, [titleNode, ...paragraphs]),
  }
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
  const notes = noteState()
  const sections: BuiltSection[] = []
  const headings: BookHeading[] = []
  let frontNumber = 0
  let contents: BuiltSection | undefined

  for (const entry of book.frontMatter) {
    if (!('html' in entry)) {
      contents = contentsSection(entry.title)
      sections.push(contents)
      continue
    }
    frontNumber += 1
    const section = authoredSection(entry, `segnavia-front-${frontNumber}`)
    sections.push(section)
    if (entry.contents && entry.title !== undefined) headings.push({ id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id })
    transformNotes(section.node, book, 0, notes)
  }

  for (const [offset, chapter] of book.chapters.entries()) {
    const number = offset + 1
    const section = chapterSection(chapter, number)
    sections.push(section)
    headings.push({ id: section.info.id, level: 1, text: chapter.title, sectionId: section.info.id }, ...chapterHeadings(section, number, book.contents.depth))
    transformNotes(section.node, book, number, notes)
  }

  if (notes.endnotes) sections.push(endnotesSection(book, notes.endnoteParagraphs))
  if (contents) addContents(book, contents, headings, options)

  const document = parse('') as Document
  document.children = [element('style', {}, [text(PRINT_CSS)]), ...withBlankPages(sections, options.blankBefore)]
  linkChildren(document)
  return {
    html: serialize(document),
    sections: sections.map((section) => section.info),
    headings,
    issues: noteMarkerIssues(book, { footnotes: notes.footnotes, endnotes: notes.endnotes }),
  }
}
