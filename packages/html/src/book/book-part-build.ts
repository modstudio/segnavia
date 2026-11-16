import { type Book, type BookSectionEntry, DEFAULT_HEADING_LISTING, isPart, plainText, type RunText, resolveDirection } from '@segnavia/format'
import type { DocumentBuild } from './book-document.ts'
import { partSection } from './book-held.ts'
import { element, linkChildren, text } from './dom.ts'
import { runTextNodes } from './run-text.ts'

type PartFact = BookSectionEntry['ancestry'][number]

export function partNames(ancestry: PartFact[], own?: PartFact): Record<string, string> {
  return Object.fromEntries([...ancestry, ...(own ? [own] : [])].map((part) => [part.name, part.title === undefined ? '' : plainText(part.title)]))
}

function generatedPartHeading(number: string | undefined, title: RunText, book: Pick<Book, 'dir' | 'lang'>) {
  const titleText = plainText(title)
  const numbered =
    number === undefined
      ? []
      : [element('span', { class: 'segnavia-part-heading-number', dir: resolveDirection(book.dir, book.lang, number) }, [element('bdi', {}, [text(number)])])]
  const titled =
    titleText === ''
      ? []
      : [
          element('span', { class: 'segnavia-part-heading-title', dir: resolveDirection(book.dir, book.lang, titleText) }, [
            element('bdi', {}, runTextNodes(title)),
          ]),
        ]
  return element('h1', { class: 'segnavia-part-heading', dir: resolveDirection(book.dir, book.lang, `${number ?? ''} ${titleText}`) }, [
    ...numbered,
    ...(numbered.length > 0 && titled.length > 0 ? [text(' ')] : []),
    ...titled,
  ])
}

function addPartOpening(sectionEntry: BookSectionEntry, build: DocumentBuild, book: Pick<Book, 'parentRules' | 'dir' | 'lang'>, id: string): void {
  const entry = sectionEntry.entry
  if (!isPart(entry) || (entry.html === undefined && entry.opens !== 'continue')) return
  const parts = partNames(sectionEntry.ancestry, { name: entry.name, title: entry.title, id, number: entry.number, numbering: entry.numbering })
  const partNumbers = Object.fromEntries(
    [...sectionEntry.ancestry, { name: entry.name, id }].flatMap((part) => {
      const number = build.structureNumbers.get(part.id)?.text
      return number === undefined ? [] : [[part.name, number]]
    }),
  )
  const section = partSection({ ...entry, parentRules: entry.parentRules ?? book.parentRules }, id, sectionEntry.division, build.build, parts, partNumbers)
  const number = build.structureNumbers.get(id)?.text
  if (entry.html === undefined) {
    section.node.children = [generatedPartHeading(number, entry.title ?? '', book)]
    linkChildren(section.node)
  }
  build.sections.push(section)
  attachPendingPartHeadings(build, sectionEntry, id)
}

function addPartHeading(sectionEntry: BookSectionEntry, build: DocumentBuild, id: string): void {
  const entry = sectionEntry.entry
  if (!isPart(entry) || !entry.contents || entry.title === undefined) return
  const number = build.structureNumbers.get(id)?.text
  const heading = {
    level: 1,
    depth: sectionEntry.depth,
    text: entry.title,
    ...(entry.contentsLabel === undefined ? {} : { contentsLabel: entry.contentsLabel }),
    ...(number === undefined ? {} : { number }),
  }
  if (entry.html === undefined) build.pendingPartHeadings.push({ ...heading, partId: id })
  else build.headings.push({ ...heading, id, block: id, sectionId: id, listed: DEFAULT_HEADING_LISTING })
}

export function addPart(sectionEntry: BookSectionEntry, build: DocumentBuild, book: Pick<Book, 'parentRules' | 'dir' | 'lang'>): boolean {
  const { entry } = sectionEntry
  if (!isPart(entry)) return false
  const id = sectionEntry.id ?? ''
  addPartHeading(sectionEntry, build, id)
  addPartOpening(sectionEntry, build, book, id)
  return true
}

export function attachPendingPartHeadings(build: DocumentBuild, sectionEntry: BookSectionEntry, id: string): void {
  const attachmentIds = new Set([...sectionEntry.ancestry.map((part) => part.id), ...(isPart(sectionEntry.entry) ? [sectionEntry.id] : [])])
  const attached = build.pendingPartHeadings.filter((heading) => attachmentIds.has(heading.partId))
  build.headings.push(...attached.map(({ partId: _partId, ...heading }) => ({ ...heading, id, block: id, sectionId: id, listed: DEFAULT_HEADING_LISTING })))
  build.pendingPartHeadings = build.pendingPartHeadings.filter((heading) => !attachmentIds.has(heading.partId))
}
