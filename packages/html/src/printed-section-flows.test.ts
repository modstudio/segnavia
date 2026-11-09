import { expect, test } from 'bun:test'
import { printedSectionFlows } from './printed-section-flows.ts'

test('binds record values and marks the printed flow', () => {
  const html = printedSectionFlows(
    [
      {
        id: 'row-1',
        html: '<p data-slot-value="name"></p>',
        values: { name: 'Ada' },
        recordTemplate: { name: 'row', slots: [{ key: 'name' }] },
        record: { index: 1, count: 3 },
      },
    ],
    { opener: 'body', recto: 'body', verso: 'body' },
  )
  expect(html).toContain('<p dir="auto">Ada</p>')
  expect(html).not.toContain('data-slot-value')
  expect(html).toContain('data-record-index="1"')
  expect(html).toContain('data-record-count="3"')
})
