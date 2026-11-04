import { type MarkdownEditorModel, setModelTitle } from './markdown-editor-model.ts'

export function updateMarkdownEditorTitle(
  model: MarkdownEditorModel,
  value: string | null | undefined,
  source: 'attribute' | 'property',
): { model: MarkdownEditorModel; removeTitleAttribute: boolean } {
  return { model: setModelTitle(model, value), removeTitleAttribute: source === 'attribute' }
}

export function renderMarkdownEditorTitle(field: HTMLInputElement, model: MarkdownEditorModel): void {
  field.hidden = model.titleSource === 'separate' && model.title === null
  field.value = model.title ?? ''
}
