import { joinLeadingHeading, normalizeMarkdownTitle, retainedLeadingHeading, splitLeadingHeading } from './markdown-title.ts'

export type MarkdownTitleSource = 'separate' | 'leading-heading'

export type MarkdownEditorModel = Readonly<{
  markdown: string
  title: string | null
  titleSource: MarkdownTitleSource
  editable: string
  retained: string
}>

export function markdownEditorModel(): MarkdownEditorModel {
  return { markdown: '', title: null, titleSource: 'separate', editable: '', retained: '' }
}

export function normalizeMarkdownLineEndings(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n')
}

export function setModelMarkdown(model: MarkdownEditorModel, markdown: string): MarkdownEditorModel {
  const normalized = normalizeMarkdownLineEndings(markdown)
  if (normalized === model.markdown) return model
  if (model.titleSource === 'separate') return { ...model, markdown: normalized, editable: normalized }
  const split = splitLeadingHeading(normalized)
  return { ...model, markdown: normalized, title: split.title ?? '', editable: split.editable, retained: split.retained }
}

export function setModelTitleSource(model: MarkdownEditorModel, titleSource: MarkdownTitleSource): MarkdownEditorModel {
  if (titleSource === model.titleSource) return model
  if (titleSource === 'separate') return { ...model, titleSource, editable: model.markdown, retained: '' }
  const split = splitLeadingHeading(model.markdown)
  return { ...model, titleSource, title: split.title ?? '', editable: split.editable, retained: split.retained }
}

export function setModelTitle(model: MarkdownEditorModel, value: string | null | undefined): MarkdownEditorModel {
  if (model.titleSource === 'leading-heading' && value == null) return model
  const title = value == null ? null : normalizeMarkdownTitle(String(value))
  if (title === model.title) return model
  if (model.titleSource === 'separate') return { ...model, title }

  const retained = retainedLeadingHeading(title, {
    title: model.title || null,
    editable: model.editable,
    retained: model.retained,
  })
  const markdown = joinLeadingHeading(model.editable, retained)
  return { ...model, markdown, title, retained }
}

export function setModelEditable(model: MarkdownEditorModel, editable: string): MarkdownEditorModel {
  const markdown = model.titleSource === 'leading-heading' ? joinLeadingHeading(editable, model.retained) : editable
  if (markdown === model.markdown && editable === model.editable) return model
  return { ...model, markdown, editable }
}
