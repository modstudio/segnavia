import { expect, test } from 'bun:test'
import { serialize } from '../sanitize.ts'
import { chapterSection } from './book-chapter-section.ts'

test('binds record values and marks the chapter flow', () => {
  const section = chapterSection(
    {
      id: 'row-1',
      html: '<p data-slot-value="name"></p>',
      values: { name: 'Ada' },
      recordTemplate: { name: 'row', slots: [{ key: 'name' }] },
      record: { index: 1, count: 3 },
    },
    1,
    'body',
    'flow',
  )
  const html = serialize(section.node)
  expect(html).toContain('<p dir="auto">Ada</p>')
  expect(html).not.toContain('data-slot-value')
  expect(section.node.attribs['data-record-index']).toBe('1')
  expect(section.node.attribs['data-record-count']).toBe('3')
})
