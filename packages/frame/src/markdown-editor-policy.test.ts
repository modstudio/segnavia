import { expect, test } from 'bun:test'
import { availableMarkdownMode, markdownChanged, richModeCommandRefusal } from './markdown-editor-policy.ts'

test('rich mode remains source until rich mode is available', () => {
  expect(availableMarkdownMode('source')).toBe('source')
  expect(availableMarkdownMode('rich')).toBe('source')
})

test('an equal markdown string emits no change', () => {
  expect(markdownChanged('same', 'same')).toBe(false)
  expect(markdownChanged('changed', 'same')).toBe(true)
})

test('unsupported commands name the command and rich mode', () => {
  expect(richModeCommandRefusal('bold').message).toBe('Cannot run "bold" because that command needs rich mode.')
})
