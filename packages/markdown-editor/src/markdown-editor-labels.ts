export interface MarkdownEditorLabels {
  rawInline: (display: string, source: string) => string
}

export const ENGLISH_MARKDOWN_EDITOR_LABELS: MarkdownEditorLabels = {
  rawInline: (display, source) => `${display}, Markdown source: ${source}`,
}

export function markdownEditorLabels(labels: Partial<MarkdownEditorLabels>): MarkdownEditorLabels {
  return { ...ENGLISH_MARKDOWN_EDITOR_LABELS, ...labels }
}
