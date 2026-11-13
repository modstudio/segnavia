import { type Book, type BookDivision, noteMarker, type ResolvedNoteSeries } from '@segnavia/format'
import { type ChildNode, type Element, isTag, isText } from 'domhandler'
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

export interface CollectedNoteRun {
  scopeKey: string
  heading?: string
  paragraphs: Element[]
}

export interface CollectedNotes {
  series: ResolvedNoteSeries
  placementKey: string
  targetId: string
  division: BookDivision
  chapter: number
  runs: CollectedNoteRun[]
}

interface AuthoredNote {
  noteId: string
  refId: string
  marker: string
  series: string
  key: 'counter' | 'line'
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

function nodeText(node: ChildNode): string {
  if (isText(node)) return node.data
  return 'children' in node ? node.children.map(nodeText).join('') : ''
}

function precedingLemma(note: Element): Element | undefined {
  let previous = note.prev
  while (previous && isText(previous) && previous.data.trim() === '') previous = previous.prev
  return previous && isTag(previous) && previous.attribs['data-lemma'] !== undefined ? previous : undefined
}

function insideNumberedBlock(node: Element): boolean {
  for (let current: ChildNode | null = node; current; current = current.parent) {
    if (isTag(current) && current.attribs['data-line-numbers'] !== undefined) return true
  }
  return false
}

function lineLabel(noteId: string, series: string, lemma: string | undefined, separator: string): Element {
  const children: ChildNode[] = [element('bdi', { 'data-segnavia-line-number': '' }), text(' ')]
  if (lemma !== undefined) children.push(element('bdi', {}, [text(lemma)]), text(separator), text(' '))
  return element('span', { 'data-segnavia-line-label': noteId, 'data-segnavia-line-series': series }, children)
}

function lineNoteParagraph(series: ResolvedNoteSeries, noteId: string, content: ChildNode[], lemma: string | undefined): Element {
  return element('p', { class: series.bodyClass, id: noteId }, [lineLabel(noteId, series.name, lemma, series.lemmaSeparator), ...content])
}

function authoredNoteReplacement(series: ResolvedNoteSeries, noteId: string, refId: string, marker: string, lemma: Element | undefined): Element {
  if (series.key !== 'line') return element('sup', { class: 'segnavia-note-ref' }, [markerLink(refId, noteId, marker)])
  return element('a', {
    id: refId,
    href: `#${noteId}`,
    'data-segnavia-line-note': noteId,
    ...(lemma ? {} : { 'data-segnavia-line-note-anchor': noteId }),
    'aria-hidden': 'true',
  })
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

const SCOPE_RANK = { page: -1, chapter: 0, part: 1, book: 2 } as const

function runHeading(series: ResolvedNoteSeries, context: NoteSectionContext): string | undefined {
  if (series.numbering === 'book' || SCOPE_RANK[series.numbering] > SCOPE_RANK[series.placement]) return undefined
  if (series.numbering === 'part') return context.part?.title
  // Chapter scope zero is shared by every front-matter and held section, so it has no single title to name.
  if (context.chapter === 0) return undefined
  return context.title
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
  const bookTarget =
    series.placement === 'book' ||
    (series.placement === 'part' && context.part === undefined) ||
    (series.placement === 'chapter' && context.division === 'front')
  const collected: CollectedNotes = {
    series,
    placementKey: key,
    targetId: bookTarget ? 'book' : series.placement === 'part' ? (context.part?.id ?? context.targetId) : context.targetId,
    division: context.division,
    chapter: context.chapter,
    runs: [],
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
  const lemma = series.key === 'line' ? precedingLemma(note) : undefined
  if (series.key === 'line' && !insideNumberedBlock(lemma ?? note)) {
    state.issues.push(
      `line-keyed note ${noteId} in series ${series.name} is not inside data-line-numbers; mark its containing block or container with data-line-numbers to clear this refusal`,
    )
  }
  if (lemma) lemma.attribs['data-segnavia-line-note-anchor'] = noteId
  replace(note, authoredNoteReplacement(series, noteId, refId, marker, lemma))
  const paragraph =
    series.key === 'line'
      ? lineNoteParagraph(series, noteId, content, lemma ? nodeText(lemma) : undefined)
      : noteParagraph(series.bodyClass, noteId, refId, marker, content)
  if (series.placement === 'page') {
    if (galley) {
      const paragraphs = state.pageParagraphs.get(series.name) ?? []
      paragraphs.push(paragraph)
      state.pageParagraphs.set(series.name, paragraphs)
    } else addPageBlock(block, paragraph, blocks, series, seriesOrder)
  } else {
    const collected = collectedNotes(series, context, state)
    const run = collected.runs.at(-1)
    if (run?.scopeKey === scope) run.paragraphs.push(paragraph)
    else collected.runs.push({ scopeKey: scope, heading: runHeading(series, context), paragraphs: [paragraph] })
  }
  if (authoredId) state.authored.set(authoredId, { noteId, refId, marker, series: series.name, key: series.key })
  state.used.add(series.name)
}

function transformRepeat(node: Element, state: NoteState): void {
  const authoredId = node.attribs['data-note-ref'] ?? ''
  const note = state.authored.get(authoredId)
  if (!note) {
    state.issues.push(`data-note-ref ${authoredId} names no earlier note; place the note before its repeated call`)
    return
  }
  if (note.key === 'line') {
    state.issues.push(
      `data-note-ref ${authoredId} repeats line-keyed note ${note.noteId} in series ${note.series}; write a separate note at this place or move it to a counter-keyed series to clear this refusal`,
    )
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
