import { expect, test } from 'bun:test'
import { MARKDOWN_EDITOR_PROPERTIES } from './element-properties.ts'
import { markdownEditorModel } from './markdown-editor-model.ts'
import { updateMarkdownEditorTitle } from './markdown-editor-title.ts'

test('every declared editor property has a setter', async () => {
  // Loading the element also loads CodeMirror, which requires a browser document.
  const source = await Bun.file(new URL('./markdown-editor.ts', import.meta.url)).text()
  for (const property of MARKDOWN_EDITOR_PROPERTIES.properties) {
    expect(source, `${MARKDOWN_EDITOR_PROPERTIES.tag}.${property}`).toMatch(new RegExp(`\\bset\\s+${property}\\s*\\(`))
  }
})

function titleChange(value: string, source: 'attribute' | 'property') {
  return updateMarkdownEditorTitle(markdownEditorModel(), value, source)
}

test('a title attribute set before upgrade becomes the document title and is removed', () => {
  const update = titleChange('Before upgrade', 'attribute')
  expect(update.model.title).toBe('Before upgrade')
  expect(update.removeTitleAttribute).toBeTrue()
})

test('changing the title attribute after upgrade changes the document title and removes the attribute', () => {
  const initial = updateMarkdownEditorTitle(markdownEditorModel(), 'First', 'attribute')
  const update = updateMarkdownEditorTitle(initial.model, 'Changed', 'attribute')
  expect(update.model.title).toBe('Changed')
  expect(update.removeTitleAttribute).toBeTrue()
})

test('setting the title property after upgrade does not add a title attribute', () => {
  const update = titleChange('Property title', 'property')
  expect(update.model.title).toBe('Property title')
  expect(update.removeTitleAttribute).toBeFalse()
})
