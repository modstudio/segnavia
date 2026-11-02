import { type Editor, Extension } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { LOCKED_BLOCK_NAME } from './markdown-rich-locked.ts'
import { MARKDOWN_EDITOR_COMMANDS, type MarkdownEditorCommand } from './markdown-editor-policy.ts'

type Args = Record<string, unknown> | undefined
type Apply = (editor: Editor, args: Args) => boolean

const commandKeys = Object.fromEntries(MARKDOWN_EDITOR_COMMANDS.map(({ name, key }) => [name, key])) as Record<MarkdownEditorCommand, string>

export const RICH_COMMANDS: Readonly<Record<Exclude<MarkdownEditorCommand, 'toggle-mode' | 'edit-in-source'>, { key: string; apply: Apply }>> = {
  bold: { key: commandKeys.bold, apply: (editor) => editor.chain().focus().toggleBold().run() },
  italic: { key: commandKeys.italic, apply: (editor) => editor.chain().focus().toggleItalic().run() },
  code: { key: commandKeys.code, apply: (editor) => editor.chain().focus().toggleCode().run() },
  strike: { key: commandKeys.strike, apply: (editor) => editor.chain().focus().toggleStrike().run() },
  paragraph: { key: commandKeys.paragraph, apply: (editor) => editor.chain().focus().setParagraph().run() },
  heading: {
    key: commandKeys.heading,
    apply: (editor, args) => editor.chain().focus().toggleHeading({ level: Number(args?.level) as 1 | 2 | 3 | 4 | 5 | 6 }).run(),
  },
  'bullet-list': { key: commandKeys['bullet-list'], apply: (editor) => editor.chain().focus().toggleBulletList().run() },
  'ordered-list': { key: commandKeys['ordered-list'], apply: (editor) => editor.chain().focus().toggleOrderedList().run() },
  'task-list': { key: commandKeys['task-list'], apply: (editor) => editor.chain().focus().toggleTaskList().run() },
  quote: { key: commandKeys.quote, apply: (editor) => editor.chain().focus().toggleBlockquote().run() },
  'code-block': { key: commandKeys['code-block'], apply: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  link: { key: commandKeys.link, apply: (editor, args) => editor.chain().focus().extendMarkRange('link').setLink({ href: String(args?.href ?? '') }).run() },
  unlink: { key: commandKeys.unlink, apply: (editor) => editor.chain().focus().extendMarkRange('link').unsetLink().run() },
  'insert-table': { key: commandKeys['insert-table'], apply: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  'add-row': { key: commandKeys['add-row'], apply: (editor) => editor.chain().focus().addRowAfter().run() },
  'delete-row': { key: commandKeys['delete-row'], apply: (editor) => editor.chain().focus().deleteRow().run() },
  'add-column': { key: commandKeys['add-column'], apply: (editor) => editor.chain().focus().addColumnAfter().run() },
  'delete-column': { key: commandKeys['delete-column'], apply: (editor) => editor.chain().focus().deleteColumn().run() },
  'delete-table': { key: commandKeys['delete-table'], apply: (editor) => editor.chain().focus().deleteTable().run() },
  undo: { key: commandKeys.undo, apply: (editor) => editor.chain().focus().undo().run() },
  redo: { key: commandKeys.redo, apply: (editor) => editor.chain().focus().redo().run() },
}

export function selectedLockedBlock(editor: Editor): { source: string } | null {
  const selection = editor.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== LOCKED_BLOCK_NAME) return null
  return { source: typeof selection.node.attrs.source === 'string' ? selection.node.attrs.source : '' }
}

export function richKeyboard(options: {
  editLocked: () => boolean
  linkRequest: (href: string | null) => void
  toggleMode: () => boolean
}) {
  return Extension.create({
    name: 'segnaviaKeyboard',
    priority: 1000,
    addKeyboardShortcuts() {
      const tableOnly = (command: keyof Pick<typeof RICH_COMMANDS, 'add-row' | 'delete-row' | 'add-column' | 'delete-column' | 'delete-table'>) =>
        this.editor.isActive('table') && RICH_COMMANDS[command].apply(this.editor, undefined)
      return {
        'Mod-Alt-m': options.toggleMode,
        'Mod-k': () => {
          const href = this.editor.isActive('link') ? String(this.editor.getAttributes('link').href ?? '') : null
          options.linkRequest(href)
          return true
        },
        'Mod-Shift-k': () => RICH_COMMANDS.unlink.apply(this.editor, undefined),
        'Mod-Alt-Shift-t': () => RICH_COMMANDS['insert-table'].apply(this.editor, undefined),
        'Mod-Alt-Shift-r': () => tableOnly('add-row'),
        'Mod-Alt-Shift-Backspace': () => tableOnly('delete-row'),
        'Mod-Alt-Shift-c': () => tableOnly('add-column'),
        'Mod-Alt-Shift-Delete': () => tableOnly('delete-column'),
        'Mod-Alt-Shift-x': () => tableOnly('delete-table'),
        Enter: () => (selectedLockedBlock(this.editor) ? options.editLocked() : false),
      }
    },
  })
}

export type RichEditorState = Readonly<{ marks: string[]; nodes: string[]; canUndo: boolean; canRedo: boolean }>

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
