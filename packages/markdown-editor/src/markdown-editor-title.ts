import type { MarkdownEditorModel } from './markdown-editor-model.ts'

export function renderMarkdownEditorTitle(field: HTMLInputElement, model: MarkdownEditorModel): void {
  field.hidden = model.titleSource === 'separate' && model.title === null
  field.value = model.title ?? ''
}
