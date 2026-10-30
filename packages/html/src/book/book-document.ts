import {
  type Book,
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
import type { ChildNode, Document } from 'domhandler'
import { elements, parse, serialize } from '../sanitize.ts'
import { addContents } from './book-contents.ts'
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
import { addPart, attachPendingParts } from './book-part-build.ts'
import { element, linkChildren, text } from './dom.ts'
import { endnotesInOrder, noteState, transformNotes } from './notes.ts'
import { type BookBuild, type BookDocument, type BookDocumentOptions, type BookHeading, bookPrintPart } from './types.ts'

function contentsSection(entry: { title?: string; opens?: string; parents?: BookSectionParents }, build: BookBuild): BuiltSection {
  const id = 'segnavia-contents'
  const title = entry.title
  const children = title !== undefined ? [element('h1', { class: 'segnavia-contents-title', dir: 'ltr' }, [text(title)])] : []
  return {
    info: { id, kind: 'contents', title, runningHead: title },
    node: sectionNode('contents', id, children, build, title, flowAttribs(entry.opens, entry.parents)),
  }
}

function chapterSection(chapter: Omit<Chapter, 'title'> & { title?: string }, index: number, build: BookBuild): BuiltSection {
  const id = `segnavia-chapter-${index}`
  const document = parse(chapter.html)
  const runningHead = chapter.runningHead ?? chapter.title
  return {
    info: { id, kind: 'chapter', title: chapter.title, runningHead },
    node: sectionNode('chapter', id, document.children, build, runningHead, flowAttribs(chapter.opens, chapter.parents)),
  }
}

function appendHeld(
  built: BuiltSection,
  heldHeadings: BookHeading[],
  extraIssues: string[],
  book: Book,
  notes: ReturnType<typeof noteState>,
  build: BookBuild,
  sections: BuiltSection[],
  headings: BookHeading[],
  issues: string[],
  notesOwner = 0,
) {
  sections.push(built)
  issues.push(...reservedIdIssues(built), ...columnIssues(built), ...extraIssues)
  headings.push(...heldHeadings)
  transformNotes(built.node, book, 0, notes, build === 'galley', notesOwner)
}

function appendDesigned(
  entry: DesignedSection,
  id: string,
  kind: 'front' | 'designed',
  book: Book,
  build: BookBuild,
  notes: ReturnType<typeof noteState>,
  sections: BuiltSection[],
  headings: BookHeading[],
  issues: string[],
  notesOwner = 0,
) {
  const held = designedSection(entry, id, kind, build, book.contents.depth, build === 'flow' ? bookFlowPageGeometry(book) : undefined)
  appendHeld(held.built, held.headings, [], book, notes, build, sections, headings, issues, notesOwner)
}

function appendTemplated(
  entry: TemplatedSection,
  id: string,
  kind: 'front' | 'templated',
  book: Book,
  build: BookBuild,
  notes: ReturnType<typeof noteState>,
  templates: Map<string, BookTemplate>,
  sections: BuiltSection[],
  headings: BookHeading[],
  issues: string[],
  notesOwner = 0,
) {
  const held = templatedSection(entry, id, kind, build, book.contents.depth, templates, build === 'flow' ? bookFlowPageGeometry(book) : undefined)
  appendHeld(held.built, held.headings, templatedSectionIssues(entry, id, templates), book, notes, build, sections, headings, issues, notesOwner)
}

function chapterHeadings(section: BuiltSection, chapter: number, depth: number): BookHeading[] {
  return collectHeadings(section.node.children, section.info.id, depth, 2, (n) => `segnavia-h-${chapter}-${n}`, { n: 0 })
}

function targetLinks(sections: BuiltSection[]): ReturnType<typeof element> {
  const ids = sections.flatMap((section) => [section.info.id, ...elements(section.node.children).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))])
  return element(
    'div',
    { class: 'segnavia-targets', 'aria-hidden': 'true' },
    [...new Set(ids)].map((id) => element('a', { href: `#${id}`, tabindex: '-1' }, [text('\u200b')])),
  )
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
  opens?: string,
): BuiltSection {
  const titleValue = book.endnotes.title
  return {
    info: { id, kind: 'endnotes', title: titleValue, runningHead },
    node: sectionNode('endnotes', id, [endnotesHeading(book), ...paragraphs], build, runningHead, opens ? flowAttribs(opens) : {}),
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
  pendingPartIds: string[]
}

function takeHeldNotesOwner(build: DocumentBuild): number {
  build.heldNotesOwner -= 1
  return build.heldNotesOwner
}

// Chapter endnotes open on either side so recto openings govern the next chapter, not the notes.
function pushChapterEndnotes(book: Book, build: DocumentBuild, id: string, owner: number): void {
  if (book.endnotes.placement !== 'chapter') return
  const paragraphs = build.notes.chapterEndnotes.get(owner) ?? []
  if (paragraphs.length === 0) return
  const runningHead = build.sections.at(-1)?.info.runningHead
  build.sections.push(endnotesSection(book, paragraphs, build.build, id, runningHead, 'any'))
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
      attachPendingParts(build)
      continue
    }
    if (isDesignedSection(entry)) {
      build.designedNumber += 1
      appendDesigned(entry, `segnavia-designed-${build.designedNumber}`, 'front', book, build.build, build.notes, build.sections, build.headings, build.issues)
      attachPendingParts(build)
      continue
    }
    if (isTemplatedSection(entry)) {
      build.templatedNumber += 1
      appendTemplated(
        entry,
        `segnavia-templated-${build.templatedNumber}`,
        'front',
        book,
        build.build,
        build.notes,
        build.templates,
        build.sections,
        build.headings,
        build.issues,
      )
      attachPendingParts(build)
      continue
    }
    frontNumber += 1
    const section = authoredSection(entry, `segnavia-front-${frontNumber}`, build.build)
    build.sections.push(section)
    attachPendingParts(build)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section))
    if ('contents' in entry && entry.contents && entry.title !== undefined) {
      build.headings.push({ id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id })
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
      appendDesigned(
        entry,
        `segnavia-designed-${build.designedNumber}`,
        'designed',
        book,
        build.build,
        build.notes,
        build.sections,
        build.headings,
        build.issues,
        owner,
      )
      attachPendingParts(build)
      pushChapterEndnotes(book, build, `segnavia-endnotes-designed-${build.designedNumber}`, owner)
      continue
    }
    if (isTemplatedSection(entry)) {
      build.templatedNumber += 1
      const owner = takeHeldNotesOwner(build)
      appendTemplated(
        entry,
        `segnavia-templated-${build.templatedNumber}`,
        'templated',
        book,
        build.build,
        build.notes,
        build.templates,
        build.sections,
        build.headings,
        build.issues,
        owner,
      )
      attachPendingParts(build)
      pushChapterEndnotes(book, build, `segnavia-endnotes-templated-${build.templatedNumber}`, owner)
      continue
    }
    if (!('html' in entry)) continue
    build.chapterNumber += 1
    const section = chapterSection(entry, build.chapterNumber, build.build)
    if (sectionEntry.ancestry.length > 0) {
      section.node.attribs['data-segnavia-parts'] = JSON.stringify(Object.fromEntries(sectionEntry.ancestry.map((part) => [part.name, part.title ?? ''])))
    }
    build.sections.push(section)
    attachPendingParts(build)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section))
    if (entry.title !== undefined) {
      build.headings.push({
        id: section.info.id,
        level: 1,
        ...(sectionEntry.depth > 0 ? { depth: sectionEntry.depth } : {}),
        text: entry.title,
        sectionId: section.info.id,
      })
    }
    build.headings.push(
      ...chapterHeadings(section, build.chapterNumber, book.contents.depth).map((heading) =>
        sectionEntry.depth > 0 ? { ...heading, depth: sectionEntry.depth } : heading,
      ),
    )
    transformNotes(section.node, book, build.chapterNumber, build.notes, build.build === 'galley')
    pushChapterEndnotes(book, build, `segnavia-endnotes-${build.chapterNumber}`, build.chapterNumber)
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
    pendingPartIds: [],
  }
  const contents = addFrontMatter(book, build)
  addChapters(book, build)
  const { notes, sections, headings, issues } = build
  if (book.endnotes.placement === 'chapter') {
    const leftover = notes.chapterEndnotes.get(0) ?? []
    if (leftover.length > 0) sections.push(endnotesSection(book, leftover, requestedBuild, 'segnavia-endnotes', book.endnotes.title))
  } else if (notes.endnotes) {
    sections.push(endnotesSection(book, endnotesInOrder(notes), requestedBuild, 'segnavia-endnotes', book.endnotes.title))
  }
  addChapters(book, build, 'end')
  if (contents) addContents(book, contents, headings, options)
  if (requestedBuild !== 'print') markBlockPositions(sections)

  const visible = sections.filter((section) => options.part === undefined || bookPrintPart(section.info.kind, section.info.division) === options.part)
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
