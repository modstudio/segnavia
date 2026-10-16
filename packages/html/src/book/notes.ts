import { type Book, noteMarker } from '@segnavia/format'
import { type ChildNode, type Element, isTag } from 'domhandler'
import { elements } from '../sanitize.ts'
import { append, element, insertAfter, replace, text } from './dom.ts'

const BLOCKS = new Set(['p', 'li', 'blockquote', 'dd', 'dt', 'figcaption', 'td', 'th', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'section', 'article'])
const INSIDE_BLOCKS = new Set(['li', 'dd', 'dt', 'td', 'th'])

export interface NoteState {
  footnotes: boolean
  endnotes: boolean
  globalFootnote: number
  chapterFootnotes: Map<number, number>
  endnoteCount: number
  endnoteParagraphs: Element[]
}

export function noteState(): NoteState {
  return { footnotes: false, endnotes: false, globalFootnote: 0, chapterFootnotes: new Map(), endnoteCount: 0, endnoteParagraphs: [] }
}

function nearestBlock(note: Element): Element | undefined {
  for (let parent = note.parent; parent; parent = parent.parent) {
    if (isTag(parent) && BLOCKS.has(parent.name)) return parent
  }
  return undefined
}

function markerLink(id: string, href: string, marker: string): Element {
  return element('a', { id, href: `#${href}` }, [element('bdi', {}, [text(marker)])])
}

function noteParagraph(className: string, noteId: string, refId: string, marker: string, content: ChildNode[]): Element {
  return element('p', { class: className, id: noteId }, [element('a', { href: `#${refId}` }, [element('bdi', {}, [text(marker)])]), text(' '), ...content])
}

function footnoteNumber(book: Book, chapter: number, state: NoteState): number {
  if (book.footnotes.restart === 'book') {
    state.globalFootnote += 1
    return state.globalFootnote
  }
  const number = (state.chapterFootnotes.get(chapter) ?? 0) + 1
  state.chapterFootnotes.set(chapter, number)
  return number
}

function addFootnoteBlock(block: Element, paragraph: Element, blocks: Map<Element, Element>): void {
  const existing = blocks.get(block)
  if (existing) {
    append(existing, paragraph)
    return
  }
  const notes = element('div', { class: 'segnavia-footnotes' }, [paragraph])
  blocks.set(block, notes)
  if (INSIDE_BLOCKS.has(block.name)) append(block, notes)
  else insertAfter(block, notes)
}

function transformFootnote(note: Element, book: Book, chapter: number, state: NoteState, blocks: Map<Element, Element>): void {
  const block = nearestBlock(note)
  if (!block) return
  const number = footnoteNumber(book, chapter, state)
  const noteId = `segnavia-fn-${chapter}-${number}`
  const refId = `segnavia-fnref-${chapter}-${number}`
  const marker = noteMarker(number, book.footnotes.marker)
  const content = [...note.children]
  replace(note, element('sup', { class: 'segnavia-note-ref' }, [markerLink(refId, noteId, marker)]))
  addFootnoteBlock(block, noteParagraph('segnavia-footnote', noteId, refId, marker, content), blocks)
  state.footnotes = true
}

function transformEndnote(note: Element, book: Book, state: NoteState): void {
  state.endnoteCount += 1
  const number = state.endnoteCount
  const noteId = `segnavia-en-${number}`
  const refId = `segnavia-enref-${number}`
  const marker = noteMarker(number, book.endnotes.marker)
  const content = [...note.children]
  replace(note, element('sup', { class: 'segnavia-note-ref' }, [markerLink(refId, noteId, marker)]))
  state.endnoteParagraphs.push(noteParagraph('segnavia-endnote', noteId, refId, marker, content))
  state.endnotes = true
}

export function transformNotes(root: Element, book: Book, chapter: number, state: NoteState): void {
  const blocks = new Map<Element, Element>()
  const notes = elements(root.children).filter(
    (node) => node.name === 'span' && (node.attribs['data-note'] === 'footnote' || node.attribs['data-note'] === 'endnote'),
  )
  for (const note of notes) {
    if (note.attribs['data-note'] === 'footnote') transformFootnote(note, book, chapter, state, blocks)
    else transformEndnote(note, book, state)
  }
}
