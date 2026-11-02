import { expect, test } from 'bun:test'
import { lockedBlockSourceOffset } from './markdown-rich-commands.ts'

test('the selected occurrence of an identical locked source resolves to its own offset', () => {
  const fence = '```mermaid\ngraph TD\n```'
  const markdown = `${fence}\n\nBetween.\n\n${fence}\n`
  expect(lockedBlockSourceOffset(markdown, fence, 1)).toBe(markdown.lastIndexOf(fence))
})
