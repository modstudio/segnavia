export const MARKDOWN_EDITOR_MODES = ['source'] as const
export type MarkdownEditorMode = 'rich' | 'source'
export type MarkdownEditorCommand = 'undo' | 'redo' | 'toggle-mode' | (string & {})
export type MarkdownEditorKeyAction = 'save' | 'toggle-mode'

export const MARKDOWN_EDITOR_KEYS = [
  { key: 'Mod-s', action: 'save' },
  { key: 'Mod-Alt-m', action: 'toggle-mode' },
] as const satisfies readonly Readonly<{ key: string; action: MarkdownEditorKeyAction }>[]

export function availableMarkdownMode(requested: unknown): (typeof MARKDOWN_EDITOR_MODES)[number] {
  return MARKDOWN_EDITOR_MODES.includes(requested as (typeof MARKDOWN_EDITOR_MODES)[number]) ? (requested as 'source') : MARKDOWN_EDITOR_MODES[0]
}

export function markdownEditorKeyAction(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'>): MarkdownEditorKeyAction | null {
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return null
  const key = event.key.toLowerCase()
  return MARKDOWN_EDITOR_KEYS.find((binding) => binding.key.toLowerCase() === `mod-${event.altKey ? 'alt-' : ''}${key}`)?.action ?? null
}

export function richModeCommandRefusal(command: string): Error {
  return new Error(`Cannot run ${JSON.stringify(command)} because that command needs rich mode.`)
}
