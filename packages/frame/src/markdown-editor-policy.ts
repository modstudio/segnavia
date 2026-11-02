export const MARKDOWN_EDITOR_MODES = ['rich', 'source'] as const
export type MarkdownEditorMode = (typeof MARKDOWN_EDITOR_MODES)[number]
export type MarkdownEditorCommand =
  | 'bold'
  | 'italic'
  | 'code'
  | 'strike'
  | 'paragraph'
  | 'heading'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'quote'
  | 'code-block'
  | 'link'
  | 'unlink'
  | 'insert-table'
  | 'add-row'
  | 'delete-row'
  | 'add-column'
  | 'delete-column'
  | 'delete-table'
  | 'undo'
  | 'redo'
  | 'toggle-mode'
  | 'edit-in-source'
export type MarkdownEditorCommandArgs = { heading: { level: 1 | 2 | 3 | 4 | 5 | 6 }; link: { href: string } }
export type MarkdownEditorKeyAction = 'save' | 'toggle-mode'

export const MARKDOWN_EDITOR_COMMANDS = [
  { name: 'bold', key: 'Mod-b' },
  { name: 'italic', key: 'Mod-i' },
  { name: 'code', key: 'Mod-e' },
  { name: 'strike', key: 'Mod-Shift-s' },
  { name: 'paragraph', key: 'Mod-Alt-0' },
  { name: 'heading', key: 'Mod-Alt-1..6' },
  { name: 'bullet-list', key: 'Mod-Shift-8' },
  { name: 'ordered-list', key: 'Mod-Shift-7' },
  { name: 'task-list', key: 'Mod-Shift-9' },
  { name: 'quote', key: 'Mod-Shift-b' },
  { name: 'code-block', key: 'Mod-Alt-c' },
  { name: 'link', key: 'Mod-k' },
  { name: 'unlink', key: 'Mod-Shift-k' },
  { name: 'insert-table', key: 'Mod-Alt-Shift-t' },
  { name: 'add-row', key: 'Mod-Alt-Shift-r' },
  { name: 'delete-row', key: 'Mod-Alt-Shift-Backspace' },
  { name: 'add-column', key: 'Mod-Alt-Shift-c' },
  { name: 'delete-column', key: 'Mod-Alt-Shift-Delete' },
  { name: 'delete-table', key: 'Mod-Alt-Shift-x' },
  { name: 'undo', key: 'Mod-z' },
  { name: 'redo', key: 'Mod-Shift-z' },
  { name: 'toggle-mode', key: 'Mod-Alt-m' },
  { name: 'edit-in-source', key: 'Enter' },
] as const satisfies readonly Readonly<{ name: MarkdownEditorCommand; key: string }>[]

export const MARKDOWN_EDITOR_KEYS = [
  { key: 'Mod-s', action: 'save' },
  { key: 'Mod-Alt-m', action: 'toggle-mode' },
] as const satisfies readonly Readonly<{ key: string; action: MarkdownEditorKeyAction }>[]

export function availableMarkdownMode(requested: unknown): MarkdownEditorMode {
  return MARKDOWN_EDITOR_MODES.includes(requested as MarkdownEditorMode) ? (requested as MarkdownEditorMode) : MARKDOWN_EDITOR_MODES[0]
}

export function markdownEditorKeyAction(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'code' | 'key' | 'metaKey' | 'shiftKey'>,
): MarkdownEditorKeyAction | null {
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return null
  const letter = event.code.startsWith('Key') ? event.code.slice(3).toLowerCase() : event.key.toLowerCase()
  const key = `mod-${event.altKey ? 'alt-' : ''}${letter}`
  return MARKDOWN_EDITOR_KEYS.find((binding) => binding.key.toLowerCase() === key)?.action ?? null
}

export function richModeCommandRefusal(command: string): Error {
  return new Error(`Cannot run ${JSON.stringify(command)} because that command needs rich mode.`)
}
