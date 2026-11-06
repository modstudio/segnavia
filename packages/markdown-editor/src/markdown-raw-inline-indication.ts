import { resolveDirection } from '@segnavia/format'
import { NodeSelection } from '@tiptap/pm/state'
import type { MarkdownEditorLabels } from './markdown-editor-labels.ts'

export type RawInlineIndicationDetail = Readonly<{
  source: string
  display: string
  rect: Readonly<{ x: number; y: number; width: number; height: number }>
  via: 'pointer' | 'keyboard'
}>

const rawInlineSelector = '[data-raw-inline]'

export function rawInlineElement(target: EventTarget | null): HTMLElement | null {
  return target && 'closest' in target ? (target as HTMLElement).closest<HTMLElement>(rawInlineSelector) : null
}

type SelectionEditor = {
  state: { selection: { from: number } }
  view: { nodeDOM(position: number): Node | null }
}

export function selectedRawInlineAtom(editor: SelectionEditor): HTMLElement | null {
  const selection = editor.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'rawInline') return null
  return rawInlineElement(editor.view.nodeDOM(selection.from))
}

export function labelRawInline(atom: HTMLElement, labels: MarkdownEditorLabels): void {
  const source = atom.dataset.rawSource ?? ''
  const display = atom.dataset.rawDisplay ?? ''
  const isolate = resolveDirection(undefined, undefined, source) === 'rtl' ? '\u2067' : '\u2066'
  atom.setAttribute('role', 'img')
  atom.setAttribute('aria-label', labels.rawInline(display, `${isolate}${source}\u2069`))
}

function detail(atom: HTMLElement, via: RawInlineIndicationDetail['via']): RawInlineIndicationDetail {
  const { x, y, width, height } = atom.getBoundingClientRect()
  return {
    source: atom.dataset.rawSource ?? '',
    display: atom.dataset.rawDisplay ?? '',
    rect: { x, y, width, height },
    via,
  }
}

export class RawInlineIndicator {
  private pointer: HTMLElement | null = null
  private keyboard: HTMLElement | null = null
  private key = 'null'

  constructor(private readonly dispatch: (detail: RawInlineIndicationDetail | null) => void) {}

  pointerEnter(atom: HTMLElement) {
    this.pointer = atom
    this.emit()
  }

  pointerLeave(atom: HTMLElement) {
    if (this.pointer === atom) this.pointer = null
    this.emit()
  }

  keyboardSelect(atom: HTMLElement | null) {
    this.keyboard = atom
    this.emit()
  }

  end() {
    this.pointer = null
    this.keyboard = null
    this.emit()
  }

  private emit() {
    const next = this.keyboard ? detail(this.keyboard, 'keyboard') : this.pointer ? detail(this.pointer, 'pointer') : null
    const key = JSON.stringify(next)
    if (key === this.key) return
    this.key = key
    this.dispatch(next)
  }
}
