import {
  type Book,
  type BookDivision,
  type BookSectionEntry,
  type BookSectionParents,
  type BookTemplate,
  bookSections,
  type Chapter,
  type DesignedSection,
  isBookContents,
  isDesignedSection,
  isPart,
  isTemplatedSection,
  noteMarkerIssues,
  resolveDirection,
  type TemplatedSection,
} from '@segnavia/format'
import type { Document } from 'domhandler'
import { elements, parse, serialize } from '../sanitize.ts'
import { addContents } from './book-contents.ts'
import { notesGalley, targetLinks, withBlankPages } from './book-document-nodes.ts'
import { BOOK_COLUMN_MAX, BOOK_COLUMN_MIN, bookDocumentCss, bookFlowPageGeometry, markBlockPositions, resolveBookBuild } from './book-flow.ts'
import {
  authoredSection,
  type BuiltSection,
  collectHeadings,
  designedSection,
  flowAttribs,
  markPlacementIssues,
  sectionNode,
  templatedSection,
  templatedSectionIssues,
  templateHolders,
  templateRegionIssues,
} from './book-held.ts'
import { duplicateIdIssues, reservedIdIssues } from './book-issues.ts'
import { addPart, attachPendingPartHeadings, partNames } from './book-part-build.ts'
import { element, linkChildren, text } from './dom.ts'
import { endnotesInOrder, noteState, transformNotes } from './notes.ts'
import { type BookBuild, type BookDocument, type BookDocumentOptions, type BookHeading, bookPrintPart } from './types.ts'

function contentsSection(entry: { title?: string; opens?: string; parents?: BookSectionParents }, build: BookBuild): BuiltSection {
  const id = 'segnavia-contents'
  const title = entry.title
  const children = title !== undefined ? [element('h1', { class: 'segnavia-contents-title', dir: 'ltr' }, [text(title)])] : []
  return {
    info: { id, kind: 'contents', division: 'front', title, runningHead: title },
    node: sectionNode('contents', id, children, build, title, flowAttribs(entry.opens, entry.parents)),
  }
}

function chapterSection(chapter: Omit<Chapter, 'title'> & { title?: string }, index: number, division: BookDivision, build: BookBuild): BuiltSection {
  const id = `segnavia-chapter-${index}`
  const document = parse(chapter.html)
  const runningHead = chapter.runningHead ?? chapter.title
  return {
    info: { id, kind: 'chapter', division, title: chapter.title, runningHead },
    node: sectionNode('chapter', id, document.children, build, runningHead, flowAttribs(chapter.opens, chapter.parents)),
  }
}

function appendDesigned(
  entry: DesignedSection,
  id: string,
  kind: 'front' | 'designed',
  book: Book,
  build: DocumentBuild,
  sectionEntry: BookSectionEntry,
  notesOwner = 0,
) {
  const held = designedSection(
    entry,
    id,
    kind,
    sectionEntry.division,
    build.build,
    book.contents.depth,
    build.build === 'flow' ? bookFlowPageGeometry(book) : undefined,
  )
  build.sections.push(held.built)
  decorateSection(sectionEntry, build)
  build.issues.push(...reservedIdIssues(held.built), ...columnIssues(held.built))
  build.headings.push(...withSectionDepth(held.headings, sectionEntry.depth))
  transformNotes(held.built.node, book, 0, build.notes, build.build === 'galley', notesOwner)
}

function appendTemplated(
  entry: TemplatedSection,
  id: string,
  kind: 'front' | 'templated',
  book: Book,
  build: DocumentBuild,
  sectionEntry: BookSectionEntry,
  notesOwner = 0,
) {
  const held = templatedSection(
    entry,
    id,
    kind,
    sectionEntry.division,
    build.build,
    book.contents.depth,
    build.templates,
    build.build === 'flow' ? bookFlowPageGeometry(book) : undefined,
  )
  build.sections.push(held.built)
  decorateSection(sectionEntry, build)
  build.issues.push(...reservedIdIssues(held.built), ...columnIssues(held.built), ...templatedSectionIssues(entry, id, build.templates))
  build.headings.push(...withSectionDepth(held.headings, sectionEntry.depth))
  transformNotes(held.built.node, book, 0, build.notes, build.build === 'galley', notesOwner)
}

function withSectionDepth(headings: BookHeading[], depth: number): BookHeading[] {
  return depth > 0 ? headings.map((heading) => ({ ...heading, depth })) : headings
}

function chapterHeadings(section: BuiltSection, chapter: number, depth: number): BookHeading[] {
  return collectHeadings(section.node.children, section.info.id, depth, 2, (n) => `segnavia-h-${chapter}-${n}`, { n: 0 })
}

function columnsValueOk(value: string): boolean {
  if (!/^[0-9]+$/.test(value)) return false
  const count = Number(value)
  return count >= BOOK_COLUMN_MIN && count <= BOOK_COLUMN_MAX
}

function columnIssues(section: BuiltSection): string[] {
  const where = `${section.info.title ?? section.info.id} (${section.info.id})`
  return elements(section.node.children).flatMap((node) => {
    const value = node.attribs['data-columns']
    if (value === undefined || columnsValueOk(value)) return []
    return [
      `The ${node.name} in ${where} could not establish data-columns ${JSON.stringify(value)}; set it to an integer from ${BOOK_COLUMN_MIN} to ${BOOK_COLUMN_MAX} to clear this`,
    ]
  })
}

function endnotesHeading(book: Book): ReturnType<typeof element> {
  const titleValue = book.endnotes.title
  return element('h1', { class: 'segnavia-endnotes-title', dir: resolveDirection(book.dir, book.lang, titleValue) }, [text(titleValue)])
}

function endnotesSection(
  book: Book,
  paragraphs: ReturnType<typeof element>[],
  build: BookBuild,
  id: string,
  runningHead: string | undefined,
  division: BookDivision,
  parts?: Record<string, string>,
  opens?: string,
): BuiltSection {
  const titleValue = book.endnotes.title
  return {
    info: { id, kind: 'endnotes', division, title: titleValue, runningHead },
    node: sectionNode('endnotes', id, [endnotesHeading(book), ...paragraphs], build, runningHead, {
      ...(opens ? flowAttribs(opens) : {}),
      ...(parts ? { 'data-segnavia-parts': JSON.stringify(parts) } : {}),
    }),
  }
}

export interface DocumentBuild {
  build: BookBuild
  notes: ReturnType<typeof noteState>
  sections: BuiltSection[]
  headings: BookHeading[]
  issues: string[]
  templates: Map<string, BookTemplate>
  designedNumber: number
  templatedNumber: number
  chapterNumber: number
  heldNotesOwner: number
  pendingPartHeadings: Array<Pick<BookHeading, 'level' | 'depth' | 'text'> & { partId: string }>
}

function decorateSection(sectionEntry: BookSectionEntry, build: DocumentBuild): void {
  const section = build.sections.at(-1)
  if (!section) return
  if (sectionEntry.ancestry.length > 0) {
    section.node.attribs['data-segnavia-parts'] = JSON.stringify(partNames(sectionEntry.ancestry))
  }
  attachPendingPartHeadings(build, sectionEntry, section.info.id)
}

function takeHeldNotesOwner(build: DocumentBuild): number {
  build.heldNotesOwner -= 1
  return build.heldNotesOwner
}

// Chapter endnotes open on either side so recto openings govern the next chapter, not the notes.
function pushChapterEndnotes(book: Book, build: DocumentBuild, id: string, owner: number, sectionEntry: BookSectionEntry): void {
  if (book.endnotes.placement !== 'chapter') return
  const paragraphs = build.notes.chapterEndnotes.get(owner) ?? []
  if (paragraphs.length === 0) return
  const runningHead = build.sections.at(-1)?.info.runningHead
  const parts = sectionEntry.ancestry.length > 0 ? partNames(sectionEntry.ancestry) : undefined
  build.sections.push(endnotesSection(book, paragraphs, build.build, id, runningHead, sectionEntry.division, parts, 'any'))
}

function addFrontMatter(book: Book, build: DocumentBuild): BuiltSection | undefined {
  let contents: BuiltSection | undefined
  let frontNumber = 0
  for (const sectionEntry of bookSections(book)) {
    if (sectionEntry.division !== 'front') continue
    const { entry } = sectionEntry
    if (isPart(entry)) {
      addPart(sectionEntry, build)
      continue
    }
    if (isBookContents(entry)) {
      contents = contentsSection(entry, build.build)
      build.sections.push(contents)
      decorateSection(sectionEntry, build)
      continue
    }
    if (isDesignedSection(entry)) {
      build.designedNumber += 1
      appendDesigned(entry, `segnavia-designed-${build.designedNumber}`, 'front', book, build, sectionEntry)
      continue
    }
    if (isTemplatedSection(entry)) {
      build.templatedNumber += 1
      appendTemplated(entry, `segnavia-templated-${build.templatedNumber}`, 'front', book, build, sectionEntry)
      continue
    }
    frontNumber += 1
    const section = authoredSection(entry, `segnavia-front-${frontNumber}`, build.build)
    build.sections.push(section)
    decorateSection(sectionEntry, build)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section))
    if ('contents' in entry && entry.contents && entry.title !== undefined) {
      build.headings.push(...withSectionDepth([{ id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id }], sectionEntry.depth))
    }
    transformNotes(section.node, book, 0, build.notes, build.build === 'galley')
  }
  return contents
}

function addChapters(book: Book, build: DocumentBuild, division: 'body' | 'end' = 'body'): void {
  for (const sectionEntry of bookSections(book)) {
    if (sectionEntry.division !== division) continue
    const { entry } = sectionEntry
    if (isPart(entry)) {
      addPart(sectionEntry, build)
      continue
    }
    if (isBookContents(entry)) continue
    if (isDesignedSection(entry)) {
      build.designedNumber += 1
      const owner = takeHeldNotesOwner(build)
      appendDesigned(entry, `segnavia-designed-${build.designedNumber}`, 'designed', book, build, sectionEntry, owner)
      pushChapterEndnotes(book, build, `segnavia-endnotes-designed-${build.designedNumber}`, owner, sectionEntry)
      continue
    }
    if (isTemplatedSection(entry)) {
      build.templatedNumber += 1
      const owner = takeHeldNotesOwner(build)
      appendTemplated(entry, `segnavia-templated-${build.templatedNumber}`, 'templated', book, build, sectionEntry, owner)
      pushChapterEndnotes(book, build, `segnavia-endnotes-templated-${build.templatedNumber}`, owner, sectionEntry)
      continue
    }
    if (!('html' in entry)) continue
    build.chapterNumber += 1
    const section = chapterSection(entry, build.chapterNumber, sectionEntry.division, build.build)
    build.sections.push(section)
    decorateSection(sectionEntry, build)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section))
    if (entry.title !== undefined) {
      build.headings.push(...withSectionDepth([{ id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id }], sectionEntry.depth))
    }
    build.headings.push(...withSectionDepth(chapterHeadings(section, build.chapterNumber, book.contents.depth), sectionEntry.depth))
    transformNotes(section.node, book, build.chapterNumber, build.notes, build.build === 'galley')
    pushChapterEndnotes(book, build, `segnavia-endnotes-${build.chapterNumber}`, build.chapterNumber, sectionEntry)
  }
}

export function bookDocument(book: Book, options: BookDocumentOptions = {}): BookDocument {
  const { build: requestedBuild, issue: buildIssue } = resolveBookBuild(book, options.build)
  const build: DocumentBuild = {
    build: requestedBuild,
    notes: noteState(),
    sections: [],
    headings: [],
    issues: [],
    templates: new Map(book.templates.map((template) => [template.name, template])),
    designedNumber: 0,
    templatedNumber: 0,
    chapterNumber: 0,
    heldNotesOwner: 0,
    pendingPartHeadings: [],
  }
  const contents = addFrontMatter(book, build)
  addChapters(book, build)
  const { notes, sections, headings, issues } = build
  if (book.endnotes.placement === 'chapter') {
    const leftover = notes.chapterEndnotes.get(0) ?? []
    if (leftover.length > 0) sections.push(endnotesSection(book, leftover, requestedBuild, 'segnavia-endnotes', book.endnotes.title, 'body'))
  } else if (notes.endnotes) {
    sections.push(endnotesSection(book, endnotesInOrder(notes), requestedBuild, 'segnavia-endnotes', book.endnotes.title, 'body'))
  }
  addChapters(book, build, 'end')
  if (contents) addContents(book, contents, headings, options)
  if (requestedBuild !== 'print') markBlockPositions(sections)

  const visible = sections.filter((section) => options.part === undefined || bookPrintPart(section.info.division) === options.part)
  const document = parse('') as Document
  document.children =
    requestedBuild === 'galley'
      ? [
          element('style', {}, [text(bookDocumentCss(book, requestedBuild))]),
          ...(options.targets ? [targetLinks(visible)] : []),
          element('div', { 'data-segnavia-galleys': '' }, [
            ...templateHolders(book.templates),
            ...visible.map((section) => section.node),
            ...(notes.footnoteParagraphs.length > 0 ? [notesGalley(notes.footnoteParagraphs)] : []),
          ]),
        ]
      : [
          element('style', {}, [text(bookDocumentCss(book, requestedBuild))]),
          ...(options.targets ? [targetLinks(visible)] : []),
          ...withBlankPages(visible, options.blankBefore),
        ]
  linkChildren(document)
  return {
    html: serialize(document),
    sections: sections.map((section) => section.info),
    headings,
    issues: [
      ...(buildIssue ? [buildIssue] : []),
      ...noteMarkerIssues(book, { footnotes: notes.footnotes, endnotes: notes.endnotes }),
      ...markPlacementIssues(book.parentPages),
      ...templateRegionIssues(book.templates),
      ...issues,
      ...duplicateIdIssues(sections, headings),
    ],
  }
}
