export interface HtmlEditorLabels {
  editor: string
  atom: (name: string) => string
}

export const ENGLISH_HTML_EDITOR_LABELS: HtmlEditorLabels = { editor: 'HTML editor', atom: (name) => `Merge field: ${name}` }

export function htmlEditorLabels(labels: Partial<HtmlEditorLabels>): HtmlEditorLabels {
  return {
    editor: labels.editor ?? ENGLISH_HTML_EDITOR_LABELS.editor,
    atom: labels.atom ?? ENGLISH_HTML_EDITOR_LABELS.atom,
  }
}
