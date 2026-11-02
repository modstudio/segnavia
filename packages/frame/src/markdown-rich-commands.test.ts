import { expect, test } from 'bun:test'
import { lockedBlockSourceOffset, RICH_KEYBOARD_COMMANDS } from './markdown-rich-commands.ts'

test('the selected occurrence of an identical locked source resolves to its own offset', () => {
  const fence = '```mermaid\ngraph TD\n```'
  const markdown = `${fence}\n\nBetween.\n\n${fence}\n`
  expect(lockedBlockSourceOffset(markdown, fence, 1)).toBe(markdown.lastIndexOf(fence))
})

test('the high-priority rich keymap binds every concrete rich command directly', () => {
  expect(RICH_KEYBOARD_COMMANDS).toEqual([
    'bold',
    'italic',
    'code',
    'strike',
    'paragraph',
    'bullet-list',
    'ordered-list',
    'task-list',
    'quote',
    'code-block',
    'link',
    'unlink',
    'insert-table',
    'add-row',
    'delete-row',
    'add-column',
    'delete-column',
    'delete-table',
    'undo',
    'redo',
  ])
})
