import { expect, test } from 'bun:test'
import { ENGLISH_HTML_EDITOR_LABELS, htmlEditorLabels } from './html-editor-labels.ts'

test('an undefined editor label keeps the English default', () => {
  expect(htmlEditorLabels({ editor: undefined }).editor).toBe(ENGLISH_HTML_EDITOR_LABELS.editor)
  expect(htmlEditorLabels({ atom: undefined }).atom('name')).toBe('Merge field: name')
})
