export const MARKDOWN_EDITOR_MODES = ['source'] as const
export type MarkdownEditorMode = 'rich' | 'source'
export type MarkdownEditorCommand = 'undo' | 'redo' | 'toggle-mode' | (string & {})

export function availableMarkdownMode(_requested: MarkdownEditorMode): 'source' {
  return 'source'
}

export function markdownChanged(markdown: string, last: string): boolean {
  return markdown !== last
}

export function richModeCommandRefusal(command: string): Error {
  return new Error(`Cannot run ${JSON.stringify(command)} because that command needs rich mode.`)
}
