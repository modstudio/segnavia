import { type Book, type BookDivision, noteMarker, type ResolvedNoteSeries } from '@segnavia/format'
import { type ChildNode, type Element, isTag } from 'domhandler'
import { elements } from '../sanitize.ts'
import { append, element, insertAfter, replace, text } from './dom.ts'

const BLOCKS = new Set(['p', 'li', 'blockquote', 'dd', 'dt', 'figcaption', 'td', 'th', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'section', 'article'])
const INSIDE_BLOCKS = new Set(['li', 'dd', 'dt', 'td', 'th'])

export interface NoteSectionContext {
  chapter: number
  title?: string
  division: BookDivision
  targetId: string
  placementKey?: string
  part?: { id: string; title?: string }
}

export interface CollectedNotes {
  series: ResolvedNoteSeries
  placementKey: string
  targetId: string
  scopeTitle?: string
  division: BookDivision
  paragraphs: Element[]
}

interface AuthoredNote {
  noteId: string
  refId: string
  marker: string
}

export interface NoteState {
  used: Set<string>
  counters: Map<string, number>
  collected: Map<string, CollectedNotes>
  pageParagraphs: Map<string, Element[]>
  authored: Map<string, AuthoredNote>
  repeatCount: number
  issues: string[]
}

export function noteState(): NoteState {
  return { used: new Set(), counters: new Map(), collected: new Map(), pageParagraphs: new Map(), authored: new Map(), repeatCount: 0, issues: [] }
}

function nearestBlock(note: Element): Element | undefined {
  for (let parent = note.parent; parent; parent = parent.parent) if (isTag(parent) && BLOCKS.has(parent.name)) return parent
  return undefined
}

function markerLink(id: string, href: string, marker: string): Element {
  return element('a', { id, href: `#${href}` }, [element('bdi', {}, [text(marker)])])
}

function noteParagraph(className: string, noteId: string, refId: string, marker: string, content: ChildNode[]): Element {
  return element('p', { class: className, id: noteId }, [element('a', { href: `#${refId}` }, [element('bdi', {}, [text(marker)])]), text(' '), ...content])
}

function scopeKey(series: ResolvedNoteSeries, context: NoteSectionContext): string {
  if (series.numbering === 'book') return 'book'
  if (series.numbering === 'part') return context.part?.id ?? 'book'
  return String(context.chapter)
}

function placementKey(series: ResolvedNoteSeries, context: NoteSectionContext): string {
  if (series.placement === 'book') return 'book'
  if (series.placement === 'part') return context.part?.id ?? 'book'
  return context.placementKey ?? String(context.chapter)
}

function nextNumber(series: ResolvedNoteSeries, context: NoteSectionContext, state: NoteState): { number: number; scope: string } {
  const scope = scopeKey(series, context)
  const key = `${series.name}:${scope}`
  const number = (state.counters.get(key) ?? 0) + 1
  state.counters.set(key, number)
  return { number, scope }
}

function noteIds(series: ResolvedNoteSeries, scope: string, chapter: number, number: number): { noteId: string; refId: string } {
  const scopePart = series.idScope === 'chapter' ? `-${chapter}` : series.numbering === 'book' ? '' : `-${scope}`
  return { noteId: `segnavia-${series.idStem}${scopePart}-${number}`, refId: `segnavia-${series.idStem}ref${scopePart}-${number}` }
}

function addPageBlock(
  block: Element,
  paragraph: Element,
  blocks: Map<Element, Map<string, Element>>,
  series: ResolvedNoteSeries,
  seriesOrder: Map<string, number>,
): void {
  const blockSeries = blocks.get(block) ?? new Map<string, Element>()
  const existing = blockSeries.get(series.name)
  if (existing) {
    append(existing, paragraph)
    return
  }
  const attributes: Record<string, string> = {
    class: series.blockClass,
    ...(series.markBlockSeries ? { 'data-segnavia-note-series': series.name } : {}),
  }
  const notes = element('div', attributes, [paragraph])
  const index = seriesOrder.get(series.name) ?? seriesOrder.size
  const next = [...blockSeries.entries()]
    .filter(([name]) => (seriesOrder.get(name) ?? seriesOrder.size) > index)
    .sort(([left], [right]) => (seriesOrder.get(left) ?? seriesOrder.size) - (seriesOrder.get(right) ?? seriesOrder.size))[0]?.[1]
  if (next?.prev) insertAfter(next.prev, notes)
  else if (INSIDE_BLOCKS.has(block.name)) append(block, notes)
  else {
    const previous = [...blockSeries.entries()]
      .filter(([name]) => (seriesOrder.get(name) ?? seriesOrder.size) < index)
      .sort(([left], [right]) => (seriesOrder.get(right) ?? seriesOrder.size) - (seriesOrder.get(left) ?? seriesOrder.size))[0]?.[1]
    insertAfter(previous ?? block, notes)
  }
  blockSeries.set(series.name, notes)
  blocks.set(block, blockSeries)
}

function collectedNotes(series: ResolvedNoteSeries, context: NoteSectionContext, state: NoteState): CollectedNotes {
  const key = placementKey(series, context)
  const mapKey = `${series.name}:${key}`
  const existing = state.collected.get(mapKey)
  if (existing) return existing
  const scopeTitle = series.placement === 'part' ? context.part?.title : series.placement === 'chapter' ? context.title : undefined
  const bookTarget =
    series.placement === 'book' ||
    (series.placement === 'part' && context.part === undefined) ||
    (series.placement === 'chapter' && context.division === 'front')
  const collected: CollectedNotes = {
    series,
    placementKey: key,
    targetId: bookTarget ? 'book' : series.placement === 'part' ? (context.part?.id ?? context.targetId) : context.targetId,
    scopeTitle,
    division: context.division,
    paragraphs: [],
  }
  state.collected.set(mapKey, collected)
  return collected
}

function transformAuthoredNote(
  note: Element,
  series: ResolvedNoteSeries,
  context: NoteSectionContext,
  state: NoteState,
  blocks: Map<Element, Map<string, Element>>,
  seriesOrder: Map<string, number>,
  galley: boolean,
): void {
  const block = nearestBlock(note)
  if (!block) return
  const { number, scope } = nextNumber(series, context, state)
  const { noteId, refId } = noteIds(series, scope, context.chapter, number)
  const marker = noteMarker(number, series.marker)
  const authoredId = note.attribs.id
  const content = [...note.children]
  replace(note, element('sup', { class: 'segnavia-note-ref' }, [markerLink(refId, noteId, marker)]))
  const paragraph = noteParagraph(series.bodyClass, noteId, refId, marker, content)
  if (series.placement === 'page') {
    if (galley) {
      const paragraphs = state.pageParagraphs.get(series.name) ?? []
      paragraphs.push(paragraph)
      state.pageParagraphs.set(series.name, paragraphs)
    } else addPageBlock(block, paragraph, blocks, series, seriesOrder)
  } else collectedNotes(series, context, state).paragraphs.push(paragraph)
  if (authoredId) state.authored.set(authoredId, { noteId, refId, marker })
  state.used.add(series.name)
}

function transformRepeat(node: Element, state: NoteState): void {
  const authoredId = node.attribs['data-note-ref'] ?? ''
  const note = state.authored.get(authoredId)
  if (!note) {
    state.issues.push(`data-note-ref ${authoredId} names no earlier note; place the note before its repeated call`)
    return
  }
  state.repeatCount += 1
  replace(
    node,
    element('sup', { class: 'segnavia-note-ref', 'data-segnavia-note-repeat': '' }, [
      markerLink(`${note.refId}-repeat-${state.repeatCount}`, note.noteId, note.marker),
    ]),
  )
}

export function transformNotes(root: Element, book: Book, context: NoteSectionContext, state: NoteState, galley = false): void {
  const blocks = new Map<Element, Map<string, Element>>()
  const byName = new Map(book.notes.map((series) => [series.name, series]))
  const seriesOrder = new Map(book.notes.map((series, index) => [series.name, index]))
  const nodes = elements(root.children).filter(
    (node) => (node.name === 'span' && node.attribs['data-note'] !== undefined) || (node.name === 'a' && node.attribs['data-note-ref'] !== undefined),
  )
  for (const node of nodes) {
    if (node.name === 'a') {
      transformRepeat(node, state)
      continue
    }
    const name = node.attribs['data-note'] ?? ''
    const series = byName.get(name)
    if (!series) {
      state.issues.push(`data-note names unknown note series ${name}; declare the series in notes or use a declared series name`)
      continue
    }
    transformAuthoredNote(node, series, context, state, blocks, seriesOrder, galley)
  }
}
