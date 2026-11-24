export interface HtmlEditorLabels {
  editor: string
}

export const ENGLISH_HTML_EDITOR_LABELS: HtmlEditorLabels = { editor: 'HTML editor' }

export function htmlEditorLabels(labels: Partial<HtmlEditorLabels>): HtmlEditorLabels {
  return { editor: labels.editor ?? ENGLISH_HTML_EDITOR_LABELS.editor }
}
