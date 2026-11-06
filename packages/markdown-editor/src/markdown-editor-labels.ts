export interface MarkdownEditorLabels {
  rawInline: (display: string, source: string) => string
}

export const ENGLISH_MARKDOWN_EDITOR_LABELS: MarkdownEditorLabels = {
  rawInline: (display, source) => `${display}, Markdown source: ${source}`,
}

export function markdownEditorLabels(labels: Partial<MarkdownEditorLabels>): MarkdownEditorLabels {
  return {
    rawInline: labels.rawInline ?? ENGLISH_MARKDOWN_EDITOR_LABELS.rawInline,
  }
}
