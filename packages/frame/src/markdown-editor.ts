import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { ensureBaseStyle } from './base-style.ts'
import {
  availableMarkdownMode,
  MARKDOWN_EDITOR_MODES,
  type MarkdownEditorCommand,
  type MarkdownEditorMode,
  markdownChanged,
  richModeCommandRefusal,
} from './markdown-editor-policy.ts'
import { markdownSourceState } from './markdown-source.ts'
import { joinLeadingHeading, normalizeMarkdownTitle, retainedLeadingHeading, splitLeadingHeading } from './markdown-title.ts'

export type MarkdownTitleSource = 'separate' | 'leading-heading'
export type MarkdownEditorStateDetail = Readonly<{ marks: []; nodes: []; canUndo: boolean; canRedo: boolean }>
export interface SegnaviaMarkdownEditor extends Omit<HTMLElement, 'title'> {
  markdown: string
  mode: 'source'
  readonly modes: readonly ['source']
  title: string | null
  titleSource: MarkdownTitleSource
  unstyled: boolean
  run(command: MarkdownEditorCommand): void
}

const TAG = 'segnavia-markdown-editor'

class MarkdownEditorElement extends HTMLElement {
  static observedAttributes = ['markdown', 'mode', 'title-source']

  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly container = document.createElement('div')
  private readonly titleField = document.createElement('input')
  private readonly sourceMount = document.createElement('div')
  private view: EditorView | null = null
  private markdownValue = ''
  private titleValue: string | null = null
  private titleSourceValue: MarkdownTitleSource = 'separate'
  private retainedHeading = ''
  private lastMarkdown = ''
  private reflecting = false

  constructor() {
    super()
    this.container.part.add('editor')
    this.titleField.part.add('title')
    this.titleField.type = 'text'
    this.titleField.dir = 'auto'
    this.titleField.setAttribute('aria-label', 'Title')
    this.sourceMount.part.add('source')
    this.container.append(this.titleField, this.sourceMount)
    this.root.append(this.container)
  }

  connectedCallback() {
    ensureBaseStyle(this.container)
    this.titleField.addEventListener('input', this.onTitleInput)
    this.titleField.addEventListener('keydown', this.onTitleKeyDown)
    this.titleField.addEventListener('paste', this.onTitlePaste)
    this.mountSource()
    this.renderTitle()
  }

  disconnectedCallback() {
    this.titleField.removeEventListener('input', this.onTitleInput)
    this.titleField.removeEventListener('keydown', this.onTitleKeyDown)
    this.titleField.removeEventListener('paste', this.onTitlePaste)
    this.view?.destroy()
    this.view = null
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (this.reflecting) return
    if (name === 'markdown') this.markdown = value ?? ''
    else if (name === 'mode') this.mode = value === 'rich' ? 'rich' : 'source'
    else this.titleSource = value === 'leading-heading' ? 'leading-heading' : 'separate'
  }

  get markdown(): string {
    return this.markdownValue
  }

  set markdown(value: string) {
    const next = String(value ?? '')
    if (next === this.markdownValue || next === this.lastMarkdown) return
    this.markdownValue = next
    this.lastMarkdown = next
    this.reflect('markdown', next)
    this.parseMarkdown()
    this.replaceSource()
  }

  get mode(): 'source' {
    return 'source'
  }

  set mode(value: MarkdownEditorMode) {
    this.reflect('mode', availableMarkdownMode(value))
  }

  get modes(): readonly ['source'] {
    return MARKDOWN_EDITOR_MODES
  }

  get title(): string {
    // The published editor interface narrows HTMLElement's tooltip title to the nullable editor title.
    return this.titleValue as unknown as string
  }

  set title(value: string | null) {
    const next = value === null ? null : normalizeMarkdownTitle(String(value))
    if (next === this.titleValue) return
    this.titleValue = next
    if (this.titleSourceValue === 'leading-heading') this.rebuildLeadingMarkdown()
    this.renderTitle()
  }

  get titleSource(): MarkdownTitleSource {
    return this.titleSourceValue
  }

  set titleSource(value: MarkdownTitleSource) {
    const next = value === 'leading-heading' ? value : 'separate'
    if (next === this.titleSourceValue) return
    this.titleSourceValue = next
    this.reflect('title-source', next === 'separate' ? null : next)
    this.parseMarkdown()
    this.replaceSource()
    this.renderTitle()
  }

  get unstyled(): boolean {
    return this.hasAttribute('unstyled')
  }

  set unstyled(value: boolean) {
    this.toggleAttribute('unstyled', value)
  }

  run(command: MarkdownEditorCommand): void {
    const view = this.view
    if (command === 'undo') {
      if (view) undo(view)
      return
    }
    if (command === 'redo') {
      if (view) redo(view)
      return
    }
    if (command === 'toggle-mode') return
    throw richModeCommandRefusal(command)
  }

  private mountSource() {
    if (this.view) return
    this.view = new EditorView({
      parent: this.sourceMount,
      root: this.root,
      state: markdownSourceState(this.editableMarkdown(), {
        change: (markdown) => this.onSourceChange(markdown),
        save: () => this.emit('segnavia-save'),
        toggleMode: () => this.run('toggle-mode'),
        state: (canUndo, canRedo) => this.emitState(canUndo, canRedo),
      }),
    })
    this.emitState(false, false)
  }

  private editableMarkdown(): string {
    return this.titleSourceValue === 'leading-heading' ? splitLeadingHeading(this.markdownValue).editable : this.markdownValue
  }

  private parseMarkdown() {
    if (this.titleSourceValue !== 'leading-heading') return
    const split = splitLeadingHeading(this.markdownValue)
    this.titleValue = split.title
    this.retainedHeading = split.retained
    this.renderTitle()
  }

  private replaceSource() {
    const view = this.view
    if (!view) return
    const next = this.editableMarkdown()
    if (next === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
  }

  private onSourceChange(editable: string) {
    const next = this.titleSourceValue === 'leading-heading' ? joinLeadingHeading(editable, this.retainedHeading) : editable
    this.markdownValue = next
    this.reflect('markdown', next)
    this.emitMarkdown(next)
  }

  private onTitleInput = () => {
    const normalized = normalizeMarkdownTitle(this.titleField.value)
    this.titleField.value = normalized
    this.titleValue = normalized
    this.emit('segnavia-title-change', { title: normalized })
    if (this.titleSourceValue === 'leading-heading') {
      this.rebuildLeadingMarkdown()
      this.emitMarkdown(this.markdownValue)
    }
  }

  private onTitleKeyDown = (event: KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey
    if (event.key === 'Enter') event.preventDefault()
    if (mod && event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.emit('segnavia-save')
    }
    if (mod && event.altKey && event.key.toLowerCase() === 'm') {
      event.preventDefault()
      this.run('toggle-mode')
    }
  }

  private onTitlePaste = (event: ClipboardEvent) => {
    const pasted = event.clipboardData?.getData('text')
    if (pasted === undefined) return
    event.preventDefault()
    this.titleField.setRangeText(normalizeMarkdownTitle(pasted), this.titleField.selectionStart ?? 0, this.titleField.selectionEnd ?? 0, 'end')
    this.onTitleInput()
  }

  private rebuildLeadingMarkdown() {
    const editable = this.view?.state.doc.toString() ?? splitLeadingHeading(this.markdownValue).editable
    const previous = splitLeadingHeading(this.markdownValue)
    this.retainedHeading = retainedLeadingHeading(this.titleValue, previous)
    this.markdownValue = joinLeadingHeading(editable, this.retainedHeading)
    this.reflect('markdown', this.markdownValue)
  }

  private renderTitle() {
    this.titleField.hidden = this.titleValue === null
    this.titleField.value = this.titleValue ?? ''
  }

  private emitMarkdown(markdown: string) {
    if (!markdownChanged(markdown, this.lastMarkdown)) return
    this.lastMarkdown = markdown
    this.emit('segnavia-markdown-change', { markdown })
  }

  private emitState(canUndo = this.view ? undoDepth(this.view.state) > 0 : false, canRedo = this.view ? redoDepth(this.view.state) > 0 : false) {
    this.emit('segnavia-editor-state', { marks: [], nodes: [], canUndo, canRedo } satisfies MarkdownEditorStateDetail)
  }

  private emit(name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }

  private reflect(name: string, value: string | null) {
    if (this.getAttribute(name) === value) return
    this.reflecting = true
    if (value === null) this.removeAttribute(name)
    else this.setAttribute(name, value)
    this.reflecting = false
  }
}

export { MARKDOWN_EDITOR_MODES, type MarkdownEditorCommand, type MarkdownEditorMode } from './markdown-editor-policy.ts'
export { joinLeadingHeading, normalizeMarkdownTitle, splitLeadingHeading } from './markdown-title.ts'

export const SegnaviaMarkdownEditor = MarkdownEditorElement as unknown as { new (): SegnaviaMarkdownEditor }

// HTMLElement declares title as string; the editor interface uses null to hide its title line.
if (!customElements.get(TAG)) customElements.define(TAG, SegnaviaMarkdownEditor as unknown as CustomElementConstructor)
