import {
  type Book,
  type BookSection,
  type BookSectionParents,
  type BookTemplate,
  type Chapter,
  type DesignedSection,
  isBookContents,
  isDesignedSection,
  isTemplatedSection,
  noteMarkerIssues,
  resolveDirection,
  type TemplatedSection,
} from '@segnavia/format'
import { type ChildNode, type Document, isTag } from 'domhandler'
import { elements, parse, serialize } from '../sanitize.ts'
import {
  type BuiltSection,
  collectHeadings,
  designedSection,
  flowAttribs,
  sectionNode,
  templatedSection,
  templateHolders,
  templateRegionNameIssues,
  undeclaredRegionIssues,
} from './book-held.ts'
import { element, linkChildren, text } from './dom.ts'
import { endnotesInOrder, noteState, transformNotes } from './notes.ts'
import { type BookDocument, type BookDocumentOptions, type BookHeading, type BookSectionInfo, bookPrintPart } from './types.ts'

// The front/body selectors here agree with bookPrintPart, the source of print membership.
const CONTENTS_CSS =
  ':where(.segnavia-contents-list){list-style:none;padding:0;margin:0}:where(.segnavia-contents-entry){display:flex}:where(.segnavia-contents-page){margin-inline-start:auto}:where(.segnavia-contents-entry[data-level="2"]){padding-inline-start:1em}:where(.segnavia-contents-entry[data-level="3"]){padding-inline-start:2em}:where(.segnavia-contents-entry[data-level="4"]){padding-inline-start:3em}:where(.segnavia-contents-entry[data-level="5"]){padding-inline-start:4em}:where(.segnavia-contents-entry[data-level="6"]){padding-inline-start:5em}'
const PRINT_CSS = `${CONTENTS_CSS}@media print{:where(.segnavia-front,.segnavia-contents)~:where(.segnavia-front,.segnavia-contents),:where(.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}:where(.segnavia-blank){break-after:page}:where(.segnavia-targets){position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip-path:inset(50%)}}`
const GALLEY_CSS = `${CONTENTS_CSS}:where([data-segnavia-galleys]){position:relative}:where([data-segnavia-flow]){orphans:inherit;widows:inherit}:where([data-segnavia-kind="fixed"],[data-segnavia-kind="templated"],[data-segnavia-template]){display:none}:where([data-segnavia-notes-galley]){border-block-start:1px solid;padding-block-start:8px}:where([data-segnavia-note]){break-inside:avoid}:where([data-segnavia-galleys] img,[data-segnavia-window] img,[data-segnavia-page-note] img){display:block;max-block-size:var(--segnavia-text-height);max-inline-size:100%;block-size:auto;inline-size:auto}`

function direction(book: Book, value: string): string {
  return resolveDirection(book.dir, book.lang, value)
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

function appendHeld(
  built: BuiltSection,
  heldHeadings: BookHeading[],
  extraIssues: string[],
  book: Book,
  notes: ReturnType<typeof noteState>,
  galley: boolean,
  sections: BuiltSection[],
  headings: BookHeading[],
  issues: string[],
  notesOwner = 0,
) {
  sections.push(built)
  issues.push(...reservedIdIssues(built), ...columnIssues(built), ...extraIssues)
  headings.push(...heldHeadings)
  transformNotes(built.node, book, 0, notes, galley, notesOwner)
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
  notesOwner = 0,
) {
  const held = designedSection(entry, id, kind, galley, book.contents.depth)
  appendHeld(held.built, held.headings, [], book, notes, galley, sections, headings, issues, notesOwner)
}

function appendTemplated(
  entry: TemplatedSection,
  id: string,
  kind: 'front' | 'templated',
  book: Book,
  galley: boolean,
  notes: ReturnType<typeof noteState>,
  templates: Map<string, BookTemplate>,
  sections: BuiltSection[],
  headings: BookHeading[],
  issues: string[],
  notesOwner = 0,
) {
  const held = templatedSection(entry, id, kind, galley, book.contents.depth)
  appendHeld(held.built, held.headings, undeclaredRegionIssues(entry, id, templates), book, notes, galley, sections, headings, issues, notesOwner)
}

function chapterHeadings(section: BuiltSection, chapter: number, depth: number): BookHeading[] {
  return collectHeadings(section.node.children, section.info.id, depth, 2, (n) => `segnavia-h-${chapter}-${n}`, { n: 0 })
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

function endnotesHeading(book: Book): ReturnType<typeof element> {
  const titleValue = book.endnotes.title
  return element('h1', { class: 'segnavia-endnotes-title', dir: direction(book, titleValue) }, [text(titleValue)])
}

function endnotesSection(
  book: Book,
  paragraphs: ReturnType<typeof element>[],
  galley: boolean,
  id: string,
  runningHead: string | undefined,
  opens?: string,
): BuiltSection {
  const titleValue = book.endnotes.title
  return {
    info: { id, kind: 'endnotes', title: titleValue, runningHead },
    node: sectionNode('endnotes', id, [endnotesHeading(book), ...paragraphs], galley, runningHead, opens ? flowAttribs(opens) : {}),
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

interface DocumentBuild {
  galley: boolean
  notes: ReturnType<typeof noteState>
  sections: BuiltSection[]
  headings: BookHeading[]
  issues: string[]
  templates: Map<string, BookTemplate>
  designedNumber: number
  templatedNumber: number
  heldNotesOwner: number
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
  build.sections.push(endnotesSection(book, paragraphs, build.galley, id, runningHead, 'any'))
}

function addFrontMatter(book: Book, build: DocumentBuild): BuiltSection | undefined {
  let contents: BuiltSection | undefined
  let frontNumber = 0
  for (const entry of book.frontMatter) {
    if (isBookContents(entry)) {
      contents = contentsSection(entry, build.galley)
      build.sections.push(contents)
      continue
    }
    if (isDesignedSection(entry)) {
      build.designedNumber += 1
      appendDesigned(entry, `segnavia-designed-${build.designedNumber}`, 'front', book, build.galley, build.notes, build.sections, build.headings, build.issues)
      continue
    }
    if (isTemplatedSection(entry)) {
      build.templatedNumber += 1
      appendTemplated(
        entry,
        `segnavia-templated-${build.templatedNumber}`,
        'front',
        book,
        build.galley,
        build.notes,
        build.templates,
        build.sections,
        build.headings,
        build.issues,
      )
      continue
    }
    frontNumber += 1
    const section = authoredSection(entry, `segnavia-front-${frontNumber}`, build.galley)
    build.sections.push(section)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section))
    if (entry.contents && entry.title !== undefined) {
      build.headings.push({ id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id })
    }
    transformNotes(section.node, book, 0, build.notes, build.galley)
  }
  return contents
}

function addChapters(book: Book, build: DocumentBuild): void {
  let chapterNumber = 0
  for (const entry of book.chapters) {
    if (isDesignedSection(entry)) {
      build.designedNumber += 1
      const owner = takeHeldNotesOwner(build)
      appendDesigned(
        entry,
        `segnavia-designed-${build.designedNumber}`,
        'designed',
        book,
        build.galley,
        build.notes,
        build.sections,
        build.headings,
        build.issues,
        owner,
      )
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
        build.galley,
        build.notes,
        build.templates,
        build.sections,
        build.headings,
        build.issues,
        owner,
      )
      pushChapterEndnotes(book, build, `segnavia-endnotes-templated-${build.templatedNumber}`, owner)
      continue
    }
    chapterNumber += 1
    const section = chapterSection(entry, chapterNumber, build.galley)
    build.sections.push(section)
    build.issues.push(...reservedIdIssues(section), ...columnIssues(section))
    build.headings.push(
      { id: section.info.id, level: 1, text: entry.title, sectionId: section.info.id },
      ...chapterHeadings(section, chapterNumber, book.contents.depth),
    )
    transformNotes(section.node, book, chapterNumber, build.notes, build.galley)
    pushChapterEndnotes(book, build, `segnavia-endnotes-${chapterNumber}`, chapterNumber)
  }
}

export function bookDocument(book: Book, options: BookDocumentOptions = {}): BookDocument {
  const build: DocumentBuild = {
    galley: book.mode === 'paginated',
    notes: noteState(),
    sections: [],
    headings: [],
    issues: [],
    templates: new Map(book.templates.map((template) => [template.name, template])),
    designedNumber: 0,
    templatedNumber: 0,
    heldNotesOwner: 0,
  }
  const contents = addFrontMatter(book, build)
  addChapters(book, build)
  const { galley, notes, sections, headings, issues } = build

  if (book.endnotes.placement === 'chapter') {
    const leftover = notes.chapterEndnotes.get(0) ?? []
    if (leftover.length > 0) sections.push(endnotesSection(book, leftover, galley, 'segnavia-endnotes', book.endnotes.title))
  } else if (notes.endnotes) {
    sections.push(endnotesSection(book, endnotesInOrder(notes), galley, 'segnavia-endnotes', book.endnotes.title))
  }
  if (contents) addContents(book, contents, headings, options)

  const visible = sections.filter((section) => options.part === undefined || bookPrintPart(section.info.kind) === options.part)
  const document = parse('') as Document
  document.children = galley
    ? [
        element('style', {}, [text(GALLEY_CSS)]),
        element('div', { 'data-segnavia-galleys': '' }, [
          ...templateHolders(book.templates),
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
    issues: [
      ...noteMarkerIssues(book, { footnotes: notes.footnotes, endnotes: notes.endnotes }),
      ...templateRegionNameIssues(book.templates),
      ...issues,
      ...duplicateIdIssues(sections, headings),
    ],
  }
}
