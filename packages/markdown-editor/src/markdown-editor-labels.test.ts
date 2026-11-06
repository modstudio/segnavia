import { expect, test } from 'bun:test'
import { ENGLISH_MARKDOWN_EDITOR_LABELS, markdownEditorLabels } from './markdown-editor-labels.ts'

test('an undefined raw-inline label keeps the English default', () => {
  expect(markdownEditorLabels({ rawInline: undefined }).rawInline).toBe(ENGLISH_MARKDOWN_EDITOR_LABELS.rawInline)
})
