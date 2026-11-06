import type { TextDirection } from '@segnavia/format'
import { resolveDirection } from '@segnavia/format'
import { NodeSelection } from '@tiptap/pm/state'
import type { MarkdownEditorLabels } from './markdown-editor-labels.ts'
import { RAW_INLINE_ATTRIBUTE, RAW_INLINE_DISPLAY_ATTRIBUTE, RAW_INLINE_NAME, RAW_INLINE_SOURCE_ATTRIBUTE } from './markdown-rich-raw-inline.ts'

export type RawInlineIndicationDetail = Readonly<{
  source: string
  display: string
  rect: Readonly<{ x: number; y: number; width: number; height: number }>
  via: 'pointer' | 'selection'
}>

const rawInlineSelector = `[${RAW_INLINE_ATTRIBUTE}]`

export function rawInlineElement(target: EventTarget | null): HTMLElement | null {
  return target && 'closest' in target ? (target as HTMLElement).closest<HTMLElement>(rawInlineSelector) : null
}

type SelectionEditor = {
  state: { selection: { from: number } }
  view: { nodeDOM(position: number): Node | null }
}

export function selectedRawInlineAtom(editor: SelectionEditor): HTMLElement | null {
  const selection = editor.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== RAW_INLINE_NAME) return null
  return rawInlineElement(editor.view.nodeDOM(selection.from))
}

export function readRawInlineAtom(atom: HTMLElement): { source: string; display: string } {
  return {
    source: atom.getAttribute(RAW_INLINE_SOURCE_ATTRIBUTE) ?? '',
    display: atom.getAttribute(RAW_INLINE_DISPLAY_ATTRIBUTE) ?? '',
  }
}

function directionContext(atom: HTMLElement): { dir: TextDirection | undefined; lang: string | undefined } {
  let dir: TextDirection | undefined
  let lang: string | undefined
  for (let element: Element | null = atom; element && (!dir || !lang); ) {
    const declaredDir = element.getAttribute('dir')
    if (!dir && (declaredDir === 'ltr' || declaredDir === 'rtl')) dir = declaredDir
    if (!lang) lang = element.getAttribute('lang') || undefined
    const root = element.getRootNode()
    element = element.parentElement ?? (root && 'host' in root ? (root as ShadowRoot).host : null)
  }
  return { dir, lang }
}

export function labelRawInline(atom: HTMLElement, labels: MarkdownEditorLabels): void {
  const { source, display } = readRawInlineAtom(atom)
  const { dir, lang } = directionContext(atom)
  const isolate = resolveDirection(dir, lang, source) === 'rtl' ? '\u2067' : '\u2066'
  atom.setAttribute('role', 'img')
  atom.setAttribute('aria-label', labels.rawInline(display, `${isolate}${source}\u2069`))
}

function detail(atom: HTMLElement, via: RawInlineIndicationDetail['via']): RawInlineIndicationDetail {
  const { x, y, width, height } = atom.getBoundingClientRect()
  const { source, display } = readRawInlineAtom(atom)
  return {
    source,
    display,
    rect: { x, y, width, height },
    via,
  }
}

export class RawInlineIndicator {
  private pointer: HTMLElement | null = null
  private selection: HTMLElement | null = null
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

  selectionSelect(atom: HTMLElement | null) {
    this.selection = atom
    this.emit()
  }

  end() {
    this.pointer = null
    this.selection = null
    this.emit()
  }

  private emit() {
    const next = this.selection ? detail(this.selection, 'selection') : this.pointer ? detail(this.pointer, 'pointer') : null
    const key = JSON.stringify(next)
    if (key === this.key) return
    this.key = key
    this.dispatch(next)
  }
}
