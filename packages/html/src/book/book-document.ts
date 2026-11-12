import {
  type Book,
  type BookContents,
  type BookSectionEntry,
  type BookTemplate,
  bookSections,
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
import { chapterSection } from './book-chapter-section.ts'
import { addContents } from './book-contents.ts'
import { continuingFlowRoots } from './book-continue.ts'
import { notesGalleys, targetLinks, withBlankPages } from './book-document-nodes.ts'
import { BOOK_COLUMN_MAX, BOOK_COLUMN_MIN, bookDocumentCss, bookFlowPageGeometry, markBlockPositions, resolveBookBuild } from './book-flow.ts'
import {
  authoredSection,
  authoredSectionAttributeIssues,
  type BuiltSection,
  collectHeadings,
  designedSection,
  designedSectionAttributeIssues,
  flowAttribs,
  numberingAttribs,
  sectionHeading,
  sectionNode,
  templatedSection,
  templatedSectionIssues,
  templateHolders,
  templateRegionIssues,
} from './book-held.ts'
import { duplicateIdIssues, pageReferenceIssues, reservedIdIssues } from './book-issues.ts'
import { pageReferenceNodes, pageReferenceTarget, pageReferenceTargets, removeAuthoredContentsPageReferenceMarkers } from './book-page-reference.ts'
import { addPart, attachPendingPartHeadings, partNames } from './book-part-build.ts'
import { element, linkChildren, text } from './dom.ts'
import { type CollectedNotes, type NoteSectionContext, noteState, transformNotes } from './notes.ts'
import { type BookBuild, type BookDocument, type BookDocumentOptions, type BookHeading, bookPrintPart } from './types.ts'

function contentsSection(entry: Pick<BookContents, 'id' | 'title' | 'opens' | 'parentRules' | 'numbering'>, build: BookBuild): BuiltSection {
  const { id } = entry
  const title = entry.title
  const children = title !== undefined ? [element('h1', { class: 'segnavia-contents-title', dir: 'ltr' }, [text(title)])] : []
  return {
    info: { id, kind: 'contents', division: 'front', title, opens: entry.opens, parentRules: entry.parentRules },
    node: sectionNode('contents', id, children, build, title, flowAttribs(entry.opens, entry.parentRules, numberingAttribs(entry.numbering))),
  }
}

function appendDesigned(entry: DesignedSection, id: string, kind: 'front' | 'designed', book: Book, build: DocumentBuild, sectionEntry: BookSectionEntry) {
  const held = designedSection(
    entry,
    id,
    kind,
    sectionEntry.division,
    build.build,
    book.contents.depth,
    build.build === 'flow' ? bookFlowPageGeometry(book, entry.pageGeometry) : undefined,
  )
  build.sections.push(held.built)
  decorateSection(sectionEntry, build)
  build.issues.push(...reservedIdIssues(held.built), ...columnIssues(held.built), ...designedSectionAttributeIssues(entry, id))
  build.headings.push(...withSectionDepth(held.headings, sectionEntry.depth))
  const context = noteContext(sectionEntry, held.built.info.id, 0, entry.title, build)
  transformNotes(held.built.node, book, context, build.notes, build.build === 'galley')
}

function appendTemplated(entry: TemplatedSection, id: string, kind: 'front' | 'templated', book: Book, build: DocumentBuild, sectionEntry: BookSectionEntry) {
  const held = templatedSection(
    entry,
    id,
    kind,
    sectionEntry.division,
    build.build,
    book.contents.depth,
    build.templates,
    build.build === 'flow' ? bookFlowPageGeometry(book, entry.pageGeometry) : undefined,
  )
  build.sections.push(held.built)
  decorateSection(sectionEntry, build)
  build.issues.push(...reservedIdIssues(held.built), ...columnIssues(held.built), ...templatedSectionIssues(entry, id, build.templates))
  build.headings.push(...withSectionDepth(held.headings, sectionEntry.depth))
  const context = noteContext(sectionEntry, held.built.info.id, 0, entry.title, build)
  transformNotes(held.built.node, book, context, build.notes, build.build === 'galley')
}

function withSectionDepth(headings: BookHeading[], depth: number): BookHeading[] {
  return depth > 0 ? headings.map((heading) => ({ ...heading, depth })) : headings
}

function chapterHeadings(section: BuiltSection, depth: number): BookHeading[] {
  return collectHeadings(section.node.children, section.info.id, depth, 2)
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

function notesHeading(book: Book, notes: CollectedNotes): ReturnType<typeof element> {
  return element('h1', { class: notes.series.titleClass, dir: resolveDirection(book.dir, book.lang, notes.series.title) }, [text(notes.series.title)])
}

function notesSection(
  book: Book,
  notes: CollectedNotes,
  build: BookBuild,
  id: string,
  title: string | undefined,
  parts?: Record<string, string>,
  opens?: string,
): BuiltSection {
  const runs = notes.runs.flatMap((run) => [
    ...(run.heading === undefined
      ? []
      : [element('p', { class: 'segnavia-notes-scope', dir: resolveDirection(book.dir, book.lang, run.heading) }, [text(run.heading)])]),
    ...run.paragraphs,
  ])
  return {
    info: {
      id,
      kind: 'endnotes',
      division: notes.targetId === 'book' ? 'body' : notes.division,
      title: notes.series.title,
      parts,
      parentRules: book.parentRules,
    },
    node: sectionNode('endnotes', id, [notesHeading(book, notes), ...runs], build, title, {
      ...flowAttribs(opens, book.parentRules),
      ...(parts ? { 'data-segnavia-parts': JSON.stringify(parts) } : {}),
      ...(notes.series.placement === 'chapter' && notes.chapter > 0 ? { 'data-segnavia-chapter': String(notes.chapter) } : {}),
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
  partTargets: Map<string, string>
  pendingPartHeadings: Array<Pick<BookHeading, 'level' | 'depth' | 'text'> & { partId: string }>
}

function decorateSection(sectionEntry: BookSectionEntry, build: DocumentBuild): void {
  const section = build.sections.at(-1)
  if (!section) return
  if (sectionEntry.ancestry.length > 0) {
    const parts = partNames(sectionEntry.ancestry)
    section.node.attribs['data-segnavia-parts'] = JSON.stringify(parts)
    section.info.parts = parts
  }
  attachPendingPartHeadings(build, sectionEntry, section.info.id)
}

function noteContext(sectionEntry: BookSectionEntry, targetId: string, chapter: number, title: string | undefined, build: DocumentBuild): NoteSectionContext {
  const ancestry = sectionEntry.ancestry.at(-1)
  for (const part of sectionEntry.ancestry) build.partTargets.set(part.id, targetId)
  return {
    chapter,
    title,
    division: sectionEntry.division,
    targetId,
    ...(chapter === 0 && sectionEntry.division !== 'front' ? { placementKey: targetId.replace(/^segnavia-/, '') } : {}),
    ...(ancestry ? { part: { id: ancestry.id, title: ancestry.title } } : {}),
  }
}

function addFrontMatter(book: Book, build: DocumentBuild): BuiltSection | undefined {
  let contents: BuiltSection | undefined
  for (const sectionEntry of bookSections(book)) {
    if (sectionEntry.division !== 'front') continue
    const { entry } = sectionEntry
    if (isPart(entry)) {
      addPart(sectionEntry, build, book.parentRules)
      continue
    }
    if (isBookContents(entry)) {
      contents = contentsSection({ ...entry, parentRules: entry.parentRules ?? book.parentRules }, build.build)
      build.sections.push(contents)
      decorateSection(sectionEntry, build)
      continue
    }
    if (isDesignedSection(entry)) {
      build.designedNumber += 1
      appendDesigned({ ...entry, parentRules: entry.parentRules ?? book.parentRules }, sectionEntry.id, 'front', book, build, sectionEntry)
      continue
    }
    if (isTemplatedSection(entry)) {
      build.templatedNumber += 1
      appendTemplated(entry, sectionEntry.id, 'front', book, build, sectionEntry)
      continue
    }
    if (!('html' in entry)) continue
    const section = authoredSection({ ...entry, parentRules: entry.parentRules ?? book.parentRules }, sectionEntry.id, build.build)
    build.sections.push(section)
    decorateSection(sectionEntry, build)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section), ...authoredSectionAttributeIssues(entry, sectionEntry.id))
    if ('contents' in entry && entry.contents && entry.title !== undefined) {
      build.headings.push(...withSectionDepth([sectionHeading({ ...entry, title: entry.title }, section.info.id)], sectionEntry.depth))
    }
    transformNotes(section.node, book, noteContext(sectionEntry, section.info.id, 0, entry.title, build), build.notes, build.build === 'galley')
  }
  return contents
}

function addChapters(book: Book, build: DocumentBuild, division: 'body' | 'end' = 'body'): void {
  for (const sectionEntry of bookSections(book)) {
    if (sectionEntry.division !== division) continue
    const { entry } = sectionEntry
    if (isPart(entry)) {
      addPart(sectionEntry, build, book.parentRules)
      continue
    }
    if (isBookContents(entry)) continue
    if (isDesignedSection(entry)) {
      build.designedNumber += 1
      appendDesigned({ ...entry, parentRules: entry.parentRules ?? book.parentRules }, sectionEntry.id, 'designed', book, build, sectionEntry)
      continue
    }
    if (isTemplatedSection(entry)) {
      build.templatedNumber += 1
      appendTemplated(entry, sectionEntry.id, 'templated', book, build, sectionEntry)
      continue
    }
    if (!('html' in entry)) continue
    build.chapterNumber += 1
    const section = chapterSection({ ...entry, parentRules: entry.parentRules ?? book.parentRules }, build.chapterNumber, sectionEntry.division, build.build)
    build.sections.push(section)
    decorateSection(sectionEntry, build)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section), ...authoredSectionAttributeIssues(entry, sectionEntry.id))
    if (entry.title !== undefined) {
      build.headings.push(...withSectionDepth([sectionHeading({ ...entry, title: entry.title }, section.info.id)], sectionEntry.depth))
    }
    build.headings.push(...withSectionDepth(chapterHeadings(section, book.contents.depth), sectionEntry.depth))
    transformNotes(
      section.node,
      book,
      noteContext(sectionEntry, section.info.id, build.chapterNumber, entry.title, build),
      build.notes,
      build.build === 'galley',
    )
  }
}

function collectedSectionId(notes: CollectedNotes): string {
  const prefix = notes.series.sectionIdPrefix
  if (notes.targetId === 'book') return prefix
  if (notes.series.placement === 'part') return `${prefix}-${notes.placementKey.replace(/^segnavia-/, '')}`
  return `${prefix}-${notes.targetId.replace(/^segnavia-/, '')}`
}

function insertCollectedSections(book: Book, build: DocumentBuild): void {
  const order = new Map(book.notes.map((series, index) => [series.name, index]))
  const collected = [...build.notes.collected.values()].sort((left, right) => (order.get(left.series.name) ?? 0) - (order.get(right.series.name) ?? 0))
  for (const notes of [...collected].reverse()) {
    if (notes.targetId === 'book') continue
    const targetId = notes.series.placement === 'part' ? (build.partTargets.get(notes.placementKey) ?? notes.targetId) : notes.targetId
    notes.targetId = targetId
    const index = build.sections.findIndex(({ info }) => info.id === targetId)
    if (index < 0) {
      build.issues.push(`note series ${notes.series.name} could not find placement target ${targetId}; keep the owning section in the book`)
      continue
    }
    const owner = build.sections[index]
    const parts = owner?.node.attribs['data-segnavia-parts']
    build.sections.splice(
      index + 1,
      0,
      notesSection(
        book,
        notes,
        build.build,
        collectedSectionId(notes),
        owner?.info.title,
        parts ? (JSON.parse(parts) as Record<string, string>) : undefined,
        'any',
      ),
    )
  }
  for (const notes of collected) {
    if (notes.targetId !== 'book') continue
    const index = build.sections.findIndex(({ info }) => info.division === 'end')
    build.sections.splice(index < 0 ? build.sections.length : index, 0, notesSection(book, notes, build.build, collectedSectionId(notes), notes.series.title))
  }
}

function writePageReferenceNumbers(book: Book, roots: ReturnType<typeof notesGalleys>, options: BookDocumentOptions): void {
  for (const node of pageReferenceNodes(roots)) {
    const id = pageReferenceTarget(node.attribs)
    if (!id) continue
    const page = options.pageNumbers?.[id] ?? ''
    node.children = [text(page)]
    node.attribs.dir = resolveDirection(book.dir, book.lang, page)
    if (options.crossLinks) node.attribs.href = `segnavia:target/${id}`
    linkChildren(node)
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
    partTargets: new Map(),
    pendingPartHeadings: [],
  }
  const contents = addFrontMatter(book, build)
  addChapters(book, build)
  addChapters(book, build, 'end')
  const { notes, sections, headings, issues } = build
  insertCollectedSections(book, build)
  const noteGalleys = notesGalleys(book.notes, notes.pageParagraphs)
  const holders =
    requestedBuild === 'galley'
      ? templateHolders(book.templates.map((template) => ({ ...template, parentRules: template.parentRules ?? book.parentRules })))
      : []
  removeAuthoredContentsPageReferenceMarkers([...sections.map((section) => section.node), ...noteGalleys, ...holders])
  if (contents) addContents(book, contents, headings, options)
  const scopes = [
    ...sections.map((section) => ({ owner: `${section.info.title ?? section.info.id} (${section.info.id})`, roots: [section.node] })),
    ...noteGalleys.map((galley) => ({ owner: `page-placed note series ${galley.attribs['data-segnavia-note-series'] ?? ''}`, roots: [galley] })),
  ]
  const referenceIssues = pageReferenceIssues(sections, scopes)
  const referenceRoots = scopes.flatMap((scope) => scope.roots)
  const referenceTargets = pageReferenceTargets(referenceRoots)
  writePageReferenceNumbers(book, referenceRoots, options)
  if (requestedBuild !== 'print') markBlockPositions(sections)

  const visible = sections.filter((section) => options.part === undefined || bookPrintPart(section.info.division) === options.part)
  const visibleRoots = continuingFlowRoots(visible)
  const document = parse('') as Document
  document.children =
    requestedBuild === 'galley'
      ? [
          element('style', {}, [text(bookDocumentCss(book, requestedBuild))]),
          ...(options.targets ? [targetLinks(visible)] : []),
          element('div', { 'data-segnavia-galleys': '' }, [...holders, ...visibleRoots.map((section) => section.node), ...noteGalleys]),
        ]
      : [
          element('style', {}, [text(bookDocumentCss(book, requestedBuild))]),
          ...(options.targets ? [targetLinks(visible)] : []),
          ...withBlankPages(visibleRoots, options.blankBefore),
        ]
  linkChildren(document)
  return {
    html: serialize(document),
    sections: sections.map((section) => section.info),
    headings,
    pageReferenceTargets: referenceTargets,
    issues: [
      ...(buildIssue ? [buildIssue] : []),
      ...noteMarkerIssues(book.notes, notes.used),
      ...notes.issues,
      ...templateRegionIssues(book.templates),
      ...issues,
      ...duplicateIdIssues(sections, headings),
      ...referenceIssues,
    ],
  }
}
