import { type Editor, Extension } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { MARKDOWN_EDITOR_COMMANDS, MARKDOWN_EDITOR_KEYS, type MarkdownEditorCommand } from './markdown-editor-policy.ts'
import type { MarkdownEditorStateDetail } from './markdown-editor-types.ts'
import { LOCKED_BLOCK_NAME } from './markdown-rich-locked.ts'

type Args = Record<string, unknown> | undefined
type Apply = (editor: Editor, args: Args) => boolean

const commandKeys = Object.fromEntries(MARKDOWN_EDITOR_COMMANDS.map(({ name, key }) => [name, key])) as Record<MarkdownEditorCommand, string>

export const RICH_KEYBOARD_COMMANDS = MARKDOWN_EDITOR_COMMANDS.filter(
  ({ name }) => name !== 'heading' && name !== 'toggle-mode' && name !== 'edit-in-source',
).map(({ name }) => name) as readonly Exclude<MarkdownEditorCommand, 'heading' | 'toggle-mode' | 'edit-in-source'>[]

export const RICH_COMMANDS: Readonly<Record<Exclude<MarkdownEditorCommand, 'toggle-mode' | 'edit-in-source'>, { apply: Apply }>> = {
  bold: { apply: (editor) => editor.chain().focus().toggleBold().run() },
  italic: { apply: (editor) => editor.chain().focus().toggleItalic().run() },
  code: { apply: (editor) => editor.chain().focus().toggleCode().run() },
  strike: { apply: (editor) => editor.chain().focus().toggleStrike().run() },
  paragraph: { apply: (editor) => editor.chain().focus().setParagraph().run() },
  heading: {
    apply: (editor, args) =>
      editor
        .chain()
        .focus()
        .toggleHeading({ level: Number(args?.level) as 1 | 2 | 3 | 4 | 5 | 6 })
        .run(),
  },
  'bullet-list': { apply: (editor) => editor.chain().focus().toggleBulletList().run() },
  'ordered-list': { apply: (editor) => editor.chain().focus().toggleOrderedList().run() },
  'task-list': { apply: (editor) => editor.chain().focus().toggleTaskList().run() },
  quote: { apply: (editor) => editor.chain().focus().toggleBlockquote().run() },
  'code-block': { apply: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  link: {
    apply: (editor, args) =>
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: String(args?.href ?? '') })
        .run(),
  },
  unlink: { apply: (editor) => editor.chain().focus().extendMarkRange('link').unsetLink().run() },
  'insert-table': { apply: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  'add-row': { apply: (editor) => editor.chain().focus().addRowAfter().run() },
  'delete-row': { apply: (editor) => editor.chain().focus().deleteRow().run() },
  'add-column': { apply: (editor) => editor.chain().focus().addColumnAfter().run() },
  'delete-column': { apply: (editor) => editor.chain().focus().deleteColumn().run() },
  'delete-table': { apply: (editor) => editor.chain().focus().deleteTable().run() },
  undo: { apply: (editor) => editor.chain().focus().undo().run() },
  redo: { apply: (editor) => editor.chain().focus().redo().run() },
}

export function selectedLockedBlock(editor: Editor): { source: string; occurrence: number } | null {
  const selection = editor.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== LOCKED_BLOCK_NAME) return null
  const source = typeof selection.node.attrs.source === 'string' ? selection.node.attrs.source : ''
  let occurrence = 0
  editor.state.doc.nodesBetween(0, selection.from, (node) => {
    if (node.type.name === LOCKED_BLOCK_NAME && node.attrs.source === source) occurrence++
  })
  return { source, occurrence }
}

export function lockedBlockSourceOffset(markdown: string, source: string, occurrence: number): number {
  let offset = -1
  for (let index = 0; index <= occurrence; index++) offset = markdown.indexOf(source, offset + 1)
  return offset
}

export function richKeyboard(options: { editLocked: () => boolean; linkRequest: (href: string | null) => void; save: () => void; toggleMode: () => boolean }) {
  return Extension.create({
    name: 'segnaviaKeyboard',
    priority: 1000,
    addKeyboardShortcuts() {
      const tableOnly = (command: keyof Pick<typeof RICH_COMMANDS, 'add-row' | 'delete-row' | 'add-column' | 'delete-column' | 'delete-table'>) =>
        this.editor.isActive('table') && RICH_COMMANDS[command].apply(this.editor, undefined)
      const commandShortcuts = Object.fromEntries(
        RICH_KEYBOARD_COMMANDS.map((command) => [commandKeys[command], () => RICH_COMMANDS[command].apply(this.editor, undefined)]),
      )
      const saveKey = MARKDOWN_EDITOR_KEYS.find(({ action }) => action === 'save')?.key
      const toggleKey = MARKDOWN_EDITOR_KEYS.find(({ action }) => action === 'toggle-mode')?.key
      if (!saveKey || !toggleKey) throw new Error('Markdown editor save and mode-toggle keys must be declared.')
      return {
        ...commandShortcuts,
        [saveKey]: () => {
          options.save()
          return true
        },
        [toggleKey]: options.toggleMode,
        [commandKeys.link]: () => {
          const href = this.editor.isActive('link') ? String(this.editor.getAttributes('link').href ?? '') : null
          options.linkRequest(href)
          return true
        },
        [commandKeys.unlink]: () => RICH_COMMANDS.unlink.apply(this.editor, undefined),
        [commandKeys['insert-table']]: () => RICH_COMMANDS['insert-table'].apply(this.editor, undefined),
        [commandKeys['add-row']]: () => tableOnly('add-row'),
        [commandKeys['delete-row']]: () => tableOnly('delete-row'),
        [commandKeys['add-column']]: () => tableOnly('add-column'),
        [commandKeys['delete-column']]: () => tableOnly('delete-column'),
        [commandKeys['delete-table']]: () => tableOnly('delete-table'),
        [commandKeys['edit-in-source']]: () => (selectedLockedBlock(this.editor) ? options.editLocked() : false),
      }
    },
  })
}

export type RichEditorState = MarkdownEditorStateDetail

export function richEditorState(editor: Editor): RichEditorState {
  const marks = ['bold', 'italic', 'code', 'strike', 'link'].filter((name) => editor.isActive(name))
  const nodeNames: readonly [string, string][] = [
    ['paragraph', 'paragraph'],
    ['bulletList', 'bullet-list'],
    ['orderedList', 'ordered-list'],
    ['taskList', 'task-list'],
    ['blockquote', 'quote'],
    ['codeBlock', 'code-block'],
    ['table', 'table'],
    [LOCKED_BLOCK_NAME, 'locked-block'],
  ]
  const nodes = nodeNames.filter(([name]) => editor.isActive(name)).map(([, vocabulary]) => vocabulary)
  for (let level = 1; level <= 6; level++) if (editor.isActive('heading', { level })) nodes.push(`heading-${level}`)
  return { marks, nodes, canUndo: editor.can().undo(), canRedo: editor.can().redo() }
}
