import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { ensureBaseStyle } from './base-style.ts'
import {
  type MarkdownEditorModel,
  type MarkdownTitleSource,
  markdownEditorModel,
  setModelEditable,
  setModelMarkdown,
  setModelTitle,
  setModelTitleSource,
} from './markdown-editor-model.ts'
import {
  availableMarkdownMode,
  MARKDOWN_EDITOR_MODES,
  type MarkdownEditorCommand,
  type MarkdownEditorMode,
  markdownEditorKeyAction,
  richModeCommandRefusal,
} from './markdown-editor-policy.ts'
import { markdownSourceState } from './markdown-source.ts'
import { normalizeMarkdownTitle } from './markdown-title.ts'

export type MarkdownEditorStateDetail = Readonly<{ marks: []; nodes: []; canUndo: boolean; canRedo: boolean }>
export interface SegnaviaMarkdownEditor extends Omit<HTMLElement, 'title'> {
  markdown: string
  get mode(): MarkdownEditorMode
  set mode(value: MarkdownEditorMode)
  readonly modes: typeof MARKDOWN_EDITOR_MODES
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
  private model: MarkdownEditorModel = markdownEditorModel()
  private modeValue: (typeof MARKDOWN_EDITOR_MODES)[number] = availableMarkdownMode('source')
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
    else if (name === 'mode') this.mode = value as MarkdownEditorMode
    else this.titleSource = value === 'leading-heading' ? 'leading-heading' : 'separate'
  }

  get markdown(): string {
    return this.model.markdown
  }

  set markdown(value: string) {
    const next = String(value ?? '')
    const model = setModelMarkdown(this.model, next)
    if (model === this.model) return
    this.applyModel(model)
    this.resetSource()
    this.emitState()
  }

  get mode(): MarkdownEditorMode {
    return this.modeValue
  }

  set mode(value: MarkdownEditorMode) {
    const next = availableMarkdownMode(value)
    if (next === this.modeValue && this.getAttribute('mode') === next) return
    this.modeValue = next
    this.reflect('mode', next)
  }

  get modes(): typeof MARKDOWN_EDITOR_MODES {
    return MARKDOWN_EDITOR_MODES
  }

  get title(): string {
    // HTMLElement declares title as string.
    return this.model.title as unknown as string
  }

  set title(value: string | null | undefined) {
    const model = setModelTitle(this.model, value)
    if (model !== this.model) this.applyModel(model)
  }

  get titleSource(): MarkdownTitleSource {
    return this.model.titleSource
  }

  set titleSource(value: MarkdownTitleSource) {
    const next = value === 'leading-heading' ? value : 'separate'
    const model = setModelTitleSource(this.model, next)
    if (model === this.model) return
    this.reflect('title-source', next === 'separate' ? null : next)
    this.applyModel(model)
    this.replaceSource()
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
      state: markdownSourceState(this.model.editable, {
        change: (markdown) => this.onSourceChange(markdown),
        save: () => this.emit('segnavia-save'),
        toggleMode: () => this.run('toggle-mode'),
        state: (canUndo, canRedo) => this.emitState(canUndo, canRedo),
      }),
    })
    this.emitState(false, false)
  }

  private replaceSource() {
    const view = this.view
    if (!view) return
    const next = this.model.editable
    if (next === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
  }

  private resetSource() {
    const view = this.view
    if (!view) return
    view.setState(
      markdownSourceState(this.model.editable, {
        change: (markdown) => this.onSourceChange(markdown),
        save: () => this.emit('segnavia-save'),
        toggleMode: () => this.run('toggle-mode'),
        state: (canUndo, canRedo) => this.emitState(canUndo, canRedo),
      }),
    )
  }

  private onSourceChange(editable: string) {
    const model = setModelEditable(this.model, editable)
    if (model === this.model) return
    this.applyModel(model)
    this.emit('segnavia-markdown-change', { markdown: model.markdown })
  }

  private onTitleInput = () => {
    const normalized = normalizeMarkdownTitle(this.titleField.value)
    this.titleField.value = normalized
    const model = setModelTitle(this.model, normalized)
    if (model === this.model) return
    this.applyModel(model)
    this.emit('segnavia-title-change', { title: normalized })
    if (model.titleSource === 'leading-heading') this.emit('segnavia-markdown-change', { markdown: model.markdown })
  }

  private onTitleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') event.preventDefault()
    const action = markdownEditorKeyAction(event)
    if (action === 'save') {
      event.preventDefault()
      this.emit('segnavia-save')
    }
    if (action === 'toggle-mode') {
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

  private applyModel(model: MarkdownEditorModel) {
    this.model = model
    this.reflect('markdown', model.markdown)
    this.renderTitle()
  }

  private renderTitle() {
    this.titleField.hidden = this.model.titleSource === 'separate' && this.model.title === null
    this.titleField.value = this.model.title ?? ''
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

export type { MarkdownTitleSource } from './markdown-editor-model.ts'
export { MARKDOWN_EDITOR_MODES, type MarkdownEditorCommand, type MarkdownEditorMode } from './markdown-editor-policy.ts'
export { joinLeadingHeading, normalizeMarkdownTitle, splitLeadingHeading } from './markdown-title.ts'

// HTMLElement declares title as string.
export const SegnaviaMarkdownEditor = MarkdownEditorElement as unknown as { new (): SegnaviaMarkdownEditor }

// HTMLElement declares title as string.
if (!customElements.get(TAG)) customElements.define(TAG, SegnaviaMarkdownEditor as unknown as CustomElementConstructor)
