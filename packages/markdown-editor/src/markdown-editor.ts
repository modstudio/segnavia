import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import type { FontReference } from '@segnavia/format'
import { upgradeProperties } from '@segnavia/frame/element-properties'
import type { FontsOptions } from '@segnavia/frame/fonts'
import { type AlertLabels, sanitizeBookCss } from '@segnavia/html'
import type { Editor } from '@tiptap/core'
import { ensureEditorStyle } from './editor-style.ts'
import { MARKDOWN_EDITOR_TAG } from './element-properties.ts'
import { MarkdownEditorFontRegistration } from './markdown-editor-font-registration.ts'
import { ENGLISH_MARKDOWN_EDITOR_LABELS, type MarkdownEditorLabels, markdownEditorLabels } from './markdown-editor-labels.ts'
import { validateMarkdownLink } from './markdown-editor-link.ts'
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
  equalAlertLabels,
  equalFontReferences,
  equalFonts,
  equalLockedFences,
  normalizeAlertLabels,
  normalizeFontReferences,
  normalizeLockedFences,
} from './markdown-editor-options.ts'
import {
  availableMarkdownMode,
  MARKDOWN_EDITOR_COMMANDS,
  MARKDOWN_EDITOR_MODES,
  type MarkdownEditorCommand,
  type MarkdownEditorMode,
  markdownEditorKeyAction,
  richModeCommandRefusal,
} from './markdown-editor-policy.ts'
import { renderMarkdownEditorTitle, updateMarkdownEditorTitle } from './markdown-editor-title.ts'
import type { MarkdownEditorStateDetail, SegnaviaMarkdownEditor as SegnaviaMarkdownEditorInterface } from './markdown-editor-types.ts'
import { RawInlineIndicator } from './markdown-raw-inline-indication.ts'
import { lockedBlockSourceOffset, RICH_COMMANDS, richEditorState, selectedLockedBlock } from './markdown-rich-commands.ts'
import { mountRichEditor } from './markdown-rich-editor.ts'
import { parseRichDocument, type RichDocumentNode, saveRichDocument } from './markdown-rich-save.ts'
import { markdownSourceState } from './markdown-source.ts'
import { normalizeMarkdownTitle } from './markdown-title.ts'

export type { MarkdownEditorStateDetail } from './markdown-editor-types.ts'
export interface SegnaviaMarkdownEditor extends SegnaviaMarkdownEditorInterface {}
const COMMAND_NAMES = new Set<string>(MARKDOWN_EDITOR_COMMANDS.map(({ name }) => name))
class MarkdownEditorElement extends HTMLElement {
  static observedAttributes = ['markdown', 'mode', 'title', 'title-source']
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly container = document.createElement('div')
  private readonly titleField = document.createElement('input')
  private readonly sourceMount = document.createElement('div')
  private readonly richMount = document.createElement('div')
  private readonly richStyle = document.createElement('style')
  private sourceView: EditorView | null = null
  private richView: Editor | null = null
  private model: MarkdownEditorModel = markdownEditorModel()
  private modeValue: MarkdownEditorMode = 'rich'
  private reflecting = false
  private richOriginal = ''
  private stateKey = ''
  private lockedFenceOptions: Record<string, string> = {}
  private cssValue = ''
  private fontOptions: FontsOptions | undefined
  private fontReferenceOptions: FontReference[] = []
  private linkOriginOptions: Iterable<string> | undefined
  private alertLabelOptions: Partial<AlertLabels> | undefined
  private words = ENGLISH_MARKDOWN_EDITOR_LABELS
  private readonly rawInlineIndicator = new RawInlineIndicator((detail) => this.emit('segnavia-raw-inline-indicate', detail))
  private readonly fontRegistration = new MarkdownEditorFontRegistration(this)
  constructor() {
    super()
    upgradeProperties(this)
    this.container.part.add('editor')
    this.titleField.part.add('title')
    this.titleField.type = 'text'
    this.titleField.dir = 'auto'
    this.titleField.setAttribute('aria-label', 'Title')
    this.sourceMount.part.add('source')
    this.richMount.part.add('rich')
    this.container.append(this.titleField, this.sourceMount, this.richMount)
    this.root.append(this.richStyle, this.container)
  }
  connectedCallback() {
    ensureEditorStyle(this.container)
    this.titleField.addEventListener('input', this.onTitleInput)
    this.titleField.addEventListener('keydown', this.onTitleKeyDown)
    this.titleField.addEventListener('paste', this.onTitlePaste)
    this.mountMode()
    renderMarkdownEditorTitle(this.titleField, this.model)
  }
  disconnectedCallback() {
    this.rawInlineIndicator.end()
    this.titleField.removeEventListener('input', this.onTitleInput)
    this.titleField.removeEventListener('keydown', this.onTitleKeyDown)
    this.titleField.removeEventListener('paste', this.onTitlePaste)
    this.sourceView?.destroy()
    this.sourceView = null
    this.richView?.destroy()
    this.richView = null
    this.fontRegistration.clear()
  }
  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (this.reflecting) return
    if (name === 'markdown') this.markdown = value ?? ''
    else if (name === 'mode') this.mode = value as MarkdownEditorMode
    else if (name === 'title') {
      if (value === null) return
      this.setTitle(value, 'attribute')
    } else this.titleSource = value === 'leading-heading' ? 'leading-heading' : 'separate'
  }
  get markdown() {
    return this.model.markdown
  }
  set markdown(value: string) {
    const model = setModelMarkdown(this.model, String(value ?? ''))
    if (model === this.model) return
    this.model = model
    this.richOriginal = model.editable
    renderMarkdownEditorTitle(this.titleField, this.model)
    this.resetVisibleEditor()
  }
  get mode() {
    return this.modeValue
  }
  set mode(value: MarkdownEditorMode) {
    this.setMode(availableMarkdownMode(value), false)
  }
  get modes() {
    return MARKDOWN_EDITOR_MODES
  }
  get title(): string {
    return this.model.title as unknown as string
  }
  set title(value: string | null | undefined) {
    this.setTitle(value, 'property')
  }
  private setTitle(value: string | null | undefined, source: 'attribute' | 'property') {
    const { model, removeTitleAttribute } = updateMarkdownEditorTitle(this.model, value, source)
    if (model !== this.model) {
      this.model = model
      renderMarkdownEditorTitle(this.titleField, this.model)
    }
    if (removeTitleAttribute) this.reflect('title', null)
  }
  get titleSource() {
    return this.model.titleSource
  }
  set titleSource(value: MarkdownTitleSource) {
    const next = value === 'leading-heading' ? value : 'separate'
    const model = setModelTitleSource(this.model, next)
    if (model === this.model) return
    this.reflect('title-source', next === 'separate' ? null : next)
    this.model = model
    this.richOriginal = model.editable
    renderMarkdownEditorTitle(this.titleField, this.model)
    this.resetVisibleEditor()
  }
  get lockedFences() {
    return this.lockedFenceOptions
  }
  set lockedFences(value: Record<string, string>) {
    const next = normalizeLockedFences(value)
    if (equalLockedFences(this.lockedFenceOptions, next)) return
    this.lockedFenceOptions = next
    if (this.modeValue === 'rich') this.resetRich()
  }
  get css() {
    return this.cssValue
  }
  set css(value: string) {
    const next = String(value ?? '')
    if (next === this.cssValue) return
    const sanitized = sanitizeBookCss(next).css
    this.cssValue = next
    this.richStyle.textContent = sanitized
    for (const page of this.richMount.querySelectorAll<HTMLElement & { css: string }>('segnavia-page')) page.css = next
  }
  get fonts() {
    return this.fontOptions
  }
  set fonts(value: FontsOptions | undefined) {
    if (equalFonts(this.fontOptions, value)) return
    this.fontOptions = value
    this.fontRegistration.load(this.fontReferenceOptions, this.fontOptions)
    if (this.modeValue === 'rich') this.resetRich()
  }
  get fontReferences() {
    return this.fontReferenceOptions
  }
  set fontReferences(value: FontReference[]) {
    const next = normalizeFontReferences(value)
    if (equalFontReferences(this.fontReferenceOptions, next)) return
    this.fontReferenceOptions = next
    this.fontRegistration.load(this.fontReferenceOptions, this.fontOptions)
    if (this.modeValue === 'rich') this.resetRich()
  }
  get linkOrigins() {
    return this.linkOriginOptions
  }
  set linkOrigins(value: Iterable<string> | undefined) {
    this.linkOriginOptions = value
  }
  get alertLabels() {
    return this.alertLabelOptions
  }
  set alertLabels(value: Partial<AlertLabels> | undefined) {
    const next = normalizeAlertLabels(value)
    if (equalAlertLabels(this.alertLabelOptions, next)) return
    this.alertLabelOptions = next
    if (this.modeValue === 'rich') this.resetRich()
  }
  get labels() {
    return this.words
  }
  set labels(value: Partial<MarkdownEditorLabels>) {
    const next = markdownEditorLabels(value ?? {})
    if (next.rawInline === this.words.rawInline) return
    this.words = next
    if (this.modeValue === 'rich') this.resetRich()
  }
  get unstyled() {
    return this.hasAttribute('unstyled')
  }
  set unstyled(value: boolean) {
    this.toggleAttribute('unstyled', value)
  }
  run(command: MarkdownEditorCommand, args?: Record<string, unknown>): boolean {
    if (!COMMAND_NAMES.has(command)) throw new Error(`Unknown markdown editor command ${JSON.stringify(command)}.`)
    if (command === 'toggle-mode') return this.setMode(this.modeValue === 'rich' ? 'source' : 'rich', true)
    if (this.modeValue === 'source') return this.runSourceCommand(command)
    const editor = this.richView
    if (!editor) return false
    if (command === 'edit-in-source') return this.editSelectedLockedBlock()
    if (command === 'link') validateMarkdownLink(String(args?.href ?? ''), this.linkOriginOptions)
    return RICH_COMMANDS[command as keyof typeof RICH_COMMANDS].apply(editor, args)
  }
  private runSourceCommand(command: MarkdownEditorCommand): boolean {
    if (command === 'undo') return this.sourceView ? undo(this.sourceView) : false
    if (command === 'redo') return this.sourceView ? redo(this.sourceView) : false
    throw richModeCommandRefusal(command)
  }
  private setMode(mode: MarkdownEditorMode, emit: boolean): boolean {
    if (mode === this.modeValue) return false
    this.modeValue = mode
    this.rawInlineIndicator.end()
    this.reflect('mode', mode)
    this.mountMode()
    if (emit) this.emit('segnavia-mode-change', { mode })
    return true
  }
  private mountMode() {
    if (!this.isConnected) return
    this.sourceMount.hidden = this.modeValue !== 'source'
    this.richMount.hidden = this.modeValue !== 'rich'
    if (this.modeValue === 'source') this.mountSource()
    else this.resetRich()
    this.fontRegistration.load(this.fontReferenceOptions, this.fontOptions)
  }
  private mountSource() {
    this.sourceView?.destroy()
    this.sourceMount.replaceChildren()
    this.sourceView = new EditorView({ parent: this.sourceMount, root: this.root, state: this.sourceState() })
    this.emitSourceState(false, false)
  }
  private sourceState() {
    return markdownSourceState(this.model.editable, {
      change: (markdown) => this.onSourceChange(markdown),
      save: () => this.emit('segnavia-save'),
      toggleMode: () => this.run('toggle-mode'),
      state: (canUndo, canRedo) => this.emitSourceState(canUndo, canRedo),
    })
  }
  private resetVisibleEditor() {
    if (this.modeValue === 'source' && this.sourceView) this.sourceView.setState(this.sourceState())
    if (this.modeValue === 'rich') this.resetRich()
    this.emitVisibleState()
  }
  private resetRich() {
    if (!this.isConnected) return
    this.rawInlineIndicator.end()
    this.richView?.destroy()
    this.richMount.replaceChildren()
    this.richOriginal = this.model.editable
    this.richView = mountRichEditor({
      mount: this.richMount,
      content: parseRichDocument(this.model.editable, { lockedFences: this.lockedFenceOptions }),
      css: () => this.cssValue,
      fonts: this.fontOptions,
      fontReferences: this.fontReferenceOptions,
      alertLabels: this.alertLabelOptions as Record<string, string> | undefined,
      linkOrigins: () => this.linkOriginOptions,
      labels: this.words,
      indicator: this.rawInlineIndicator,
      change: (content) => this.onRichChange(content),
      state: (state) => this.emitState(state),
      linkRequest: (href) => this.emit('segnavia-link-request', { href }),
      save: () => this.emit('segnavia-save'),
      toggleMode: () => this.setMode('source', true),
      editLocked: () => this.editSelectedLockedBlock(),
    })
  }

  private onRichChange(content: readonly RichDocumentNode[]) {
    const editable = saveRichDocument(this.richOriginal, content, { lockedFences: this.lockedFenceOptions })
    const model = setModelEditable(this.model, editable)
    if (model === this.model) return
    this.model = model
    this.emit('segnavia-markdown-change', { markdown: model.markdown })
  }

  private editSelectedLockedBlock(): boolean {
    const selected = this.richView ? selectedLockedBlock(this.richView) : null
    if (!selected) throw new Error('Cannot edit in source because no locked block is selected; select a locked block to clear this refusal.')
    const position = lockedBlockSourceOffset(this.model.editable, selected.source, selected.occurrence)
    this.setMode('source', true)
    const view = this.sourceView
    if (view && position >= 0) view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position) })
    view?.focus()
    return true
  }

  private onSourceChange(editable: string) {
    const model = setModelEditable(this.model, editable)
    if (model === this.model) return
    this.model = model
    this.emit('segnavia-markdown-change', { markdown: model.markdown })
  }

  private onTitleInput = () => {
    const normalized = normalizeMarkdownTitle(this.titleField.value)
    this.titleField.value = normalized
    const model = setModelTitle(this.model, normalized)
    if (model === this.model) return
    this.model = model
    this.emit('segnavia-title-change', { title: normalized })
    if (model.titleSource === 'leading-heading') this.emit('segnavia-markdown-change', { markdown: model.markdown })
  }

  private onTitleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') event.preventDefault()
    const action = markdownEditorKeyAction(event)
    if (!action) return
    event.preventDefault()
    if (action === 'save') this.emit('segnavia-save')
    else this.run('toggle-mode')
  }

  private onTitlePaste = (event: ClipboardEvent) => {
    const pasted = event.clipboardData?.getData('text')
    if (pasted === undefined) return
    event.preventDefault()
    this.titleField.setRangeText(normalizeMarkdownTitle(pasted), this.titleField.selectionStart ?? 0, this.titleField.selectionEnd ?? 0, 'end')
    this.onTitleInput()
  }

  private emitSourceState(
    canUndo = this.sourceView ? undoDepth(this.sourceView.state) > 0 : false,
    canRedo = this.sourceView ? redoDepth(this.sourceView.state) > 0 : false,
  ) {
    this.emitState({ marks: [], nodes: [], canUndo, canRedo })
  }
  private emitVisibleState() {
    if (this.modeValue === 'rich' && this.richView) this.emitState(richEditorState(this.richView))
    else this.emitSourceState()
  }
  private emitState(state: MarkdownEditorStateDetail) {
    const key = JSON.stringify(state)
    if (key === this.stateKey) return
    this.stateKey = key
    this.emit('segnavia-editor-state', state)
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

export type { FontsOptions } from '@segnavia/frame/fonts'
export { MARKDOWN_EDITOR_PROPERTIES, MARKDOWN_EDITOR_TAG } from './element-properties.ts'
export { ENGLISH_MARKDOWN_EDITOR_LABELS, type MarkdownEditorLabels } from './markdown-editor-labels.ts'
export type { MarkdownTitleSource } from './markdown-editor-model.ts'
export { MARKDOWN_EDITOR_COMMANDS, MARKDOWN_EDITOR_MODES, type MarkdownEditorCommand, type MarkdownEditorMode } from './markdown-editor-policy.ts'
export type { RawInlineIndicationDetail } from './markdown-raw-inline-indication.ts'
export { joinLeadingHeading, normalizeMarkdownTitle, splitLeadingHeading } from './markdown-title.ts'
export const SegnaviaMarkdownEditor: { new (): SegnaviaMarkdownEditor } = MarkdownEditorElement as unknown as { new (): SegnaviaMarkdownEditor }
if (!customElements.get(MARKDOWN_EDITOR_TAG)) customElements.define(MARKDOWN_EDITOR_TAG, SegnaviaMarkdownEditor as unknown as CustomElementConstructor)
