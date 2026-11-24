import type { ElementPropertyTable } from '@segnavia/frame/element-properties'
import { upgradeProperties } from '@segnavia/frame/element-properties'
import { cleanHtml, type DroppedContent, HtmlProfile, type HtmlProfile as HtmlProfileValue } from '@segnavia/html'
import { Editor } from '@tiptap/core'
import { ensureEditorStyle } from './editor-style.ts'
import { atomizeHtmlEditor } from './html-editor-atom.ts'
import { commandRefusal, htmlEditorCommands, runHtmlEditorCommand } from './html-editor-commands.ts'
import { htmlEditorExtensions } from './html-editor-extensions.ts'
import { attachHtmlEditor, detachHtmlEditor, htmlEditorTestSeam } from './html-editor-internals.ts'
import { ENGLISH_HTML_EDITOR_LABELS, type HtmlEditorLabels, htmlEditorLabels } from './html-editor-labels.ts'
import { HTML_EDITOR_COMMANDS, type HtmlEditorCommand, type HtmlEditorCommands } from './html-editor-policy.ts'
import { HtmlEditorStateEmitter } from './html-editor-state.ts'

export const HTML_EDITOR_TAG = 'segnavia-html-editor'
export const HTML_EDITOR_PROPERTIES = {
  tag: HTML_EDITOR_TAG,
  properties: ['html', 'profile', 'labels', 'drawAtom', 'commands', 'dropped'] as const,
  events: ['segnavia-html-change', 'segnavia-html-dropped', 'segnavia-editor-state'] as const,
} satisfies ElementPropertyTable

const COMMAND_NAMES = new Set<string>(HTML_EDITOR_COMMANDS)
const DEFAULT_PROFILE = HtmlProfile.parse({ blocks: { p: true }, marks: [] })

export interface SegnaviaHtmlEditor extends HTMLElement {
  html: string
  profile: HtmlProfileValue
  labels: HtmlEditorLabels
  drawAtom: ((name: string) => Node | string) | undefined
  readonly commands: HtmlEditorCommands
  readonly dropped: DroppedContent[]
  run(command: HtmlEditorCommand, args?: Record<string, unknown>): boolean
}

class HtmlEditorElement extends HTMLElement implements SegnaviaHtmlEditor {
  static observedAttributes = ['html']
  private readonly root = this.attachShadow({ mode: 'open' })
  private readonly mount = document.createElement('div')
  private editor: Editor | null = null
  private htmlValue = ''
  private profileValue = DEFAULT_PROFILE
  private words = ENGLISH_HTML_EDITOR_LABELS
  private drawAtomValue: ((name: string) => Node | string) | undefined
  private droppedValue: DroppedContent[] = []
  private commandsValue = htmlEditorCommands(null, this.profileValue)
  private reflecting = false
  private readonly state = new HtmlEditorStateEmitter((commands) => this.emit('segnavia-editor-state', commands))

  constructor() {
    super()
    upgradeProperties(this)
    this.mount.part.add('editor')
    this.mount.setAttribute('role', 'textbox')
    this.mount.setAttribute('aria-multiline', 'true')
    this.mount.setAttribute('aria-label', this.words.editor)
    this.root.append(this.mount)
  }

  connectedCallback(): void {
    ensureEditorStyle(this.mount)
    this.resetEditor()
  }

  disconnectedCallback(): void {
    this.editor?.destroy()
    this.editor = null
    detachHtmlEditor(this)
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (!this.reflecting && name === 'html') this.html = value ?? ''
  }

  get html(): string {
    if (!this.editor) return this.htmlValue
    return cleanHtml(this.editor.getHTML(), this.profileValue).html
  }

  set html(value: string) {
    this.open(String(value ?? ''))
  }

  get profile(): HtmlProfileValue {
    return this.profileValue
  }

  set profile(value: HtmlProfileValue) {
    const next = HtmlProfile.parse(value)
    if (JSON.stringify(next) === JSON.stringify(this.profileValue)) return
    const source = this.html
    this.profileValue = next
    this.open(source)
    this.resetEditor()
  }

  get labels(): HtmlEditorLabels {
    return this.words
  }

  set labels(value: Partial<HtmlEditorLabels>) {
    this.words = htmlEditorLabels(value ?? {})
    this.mount.setAttribute('aria-label', this.words.editor)
    if (this.profileValue.atoms) this.resetEditor()
  }

  get drawAtom(): ((name: string) => Node | string) | undefined {
    return this.drawAtomValue
  }

  set drawAtom(value: ((name: string) => Node | string) | undefined) {
    this.drawAtomValue = value
    if (this.profileValue.atoms) this.resetEditor()
  }

  get commands(): HtmlEditorCommands {
    return this.commandsValue
  }

  get dropped(): DroppedContent[] {
    return this.droppedValue
  }

  get unstyled(): boolean {
    return this.hasAttribute('unstyled')
  }

  set unstyled(value: boolean) {
    this.toggleAttribute('unstyled', value)
  }

  run(command: HtmlEditorCommand, args?: Record<string, unknown>): boolean {
    if (!COMMAND_NAMES.has(command)) throw new Error(`Unknown HTML editor command ${JSON.stringify(command)}.`)
    const refusal = commandRefusal(this.profileValue, command, args)
    if (refusal) throw refusal
    if (!this.editor) return false
    const ran = runHtmlEditorCommand(this.editor, this.profileValue, command, args)
    this.updateCommands()
    return ran
  }

  private open(source: string): void {
    const cleaned = cleanHtml(source, this.profileValue)
    this.htmlValue = cleaned.html
    this.droppedValue = cleaned.dropped
    this.reflectHtml(cleaned.html)
    if (this.editor && this.html !== cleaned.html) {
      htmlEditorTestSeam.setContent(this.editor, cleaned.html)
      atomizeHtmlEditor(this.editor)
    }
    if (cleaned.dropped.length > 0) this.emit('segnavia-html-dropped', { dropped: this.droppedValue })
    this.updateCommands()
  }

  private resetEditor(): void {
    if (!this.isConnected) return
    this.editor?.destroy()
    this.mount.replaceChildren()
    this.editor = new Editor({
      element: this.mount,
      extensions: htmlEditorExtensions(this.profileValue, {
        draw: (name) => this.drawAtomValue?.(name),
        label: (name) => this.words.atom(name),
      }),
      content: this.htmlValue,
      onUpdate: () => this.onUpdate(),
      onSelectionUpdate: () => this.updateCommands(),
      onTransaction: () => this.updateCommands(),
    })
    atomizeHtmlEditor(this.editor)
    attachHtmlEditor(this, this.editor)
    this.updateCommands()
  }

  private onUpdate(): void {
    if (!this.editor) return
    if (atomizeHtmlEditor(this.editor)) return
    const cleaned = cleanHtml(this.editor.getHTML(), this.profileValue)
    if (cleaned.html === this.htmlValue) return
    this.htmlValue = cleaned.html
    this.reflectHtml(cleaned.html)
    this.emit('segnavia-html-change', { html: cleaned.html })
    this.updateCommands()
  }

  private updateCommands(): void {
    this.commandsValue = htmlEditorCommands(this.editor, this.profileValue)
    this.state.emit(this.commandsValue)
  }

  private reflectHtml(value: string): void {
    if (this.getAttribute('html') === value) return
    this.reflecting = true
    this.setAttribute('html', value)
    this.reflecting = false
  }

  private emit(name: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }
}

export { ENGLISH_HTML_EDITOR_LABELS, type HtmlEditorLabels } from './html-editor-labels.ts'
export { HTML_EDITOR_COMMANDS, type HtmlEditorCommand, type HtmlEditorCommands } from './html-editor-policy.ts'
export const SegnaviaHtmlEditor: { new (): SegnaviaHtmlEditor } = HtmlEditorElement
if (!customElements.get(HTML_EDITOR_TAG)) customElements.define(HTML_EDITOR_TAG, SegnaviaHtmlEditor)
