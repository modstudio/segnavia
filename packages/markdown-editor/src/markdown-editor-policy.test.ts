import { expect, test } from 'bun:test'
import { MARKDOWN_EDITOR_COMMANDS, markdownEditorKeyAction } from './markdown-editor-policy.ts'

test('every command has one distinct key', () => {
  expect(MARKDOWN_EDITOR_COMMANDS.every(({ key }) => key.length > 0)).toBe(true)
  expect(new Set(MARKDOWN_EDITOR_COMMANDS.map(({ key }) => key.toLowerCase())).size).toBe(MARKDOWN_EDITOR_COMMANDS.length)
})

test('letter shortcuts match event.code when Option changes event.key', () => {
  expect(markdownEditorKeyAction({ altKey: true, ctrlKey: false, metaKey: true, shiftKey: false, code: 'KeyM', key: 'µ' })).toBe('toggle-mode')
})
