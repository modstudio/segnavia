import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

test('joins a continuing section to its predecessor flow with a titled boundary', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    chapters: [
      { title: 'One', html: '<p>First</p>' },
      { title: 'Two', html: '<p>Second</p>', opens: 'continue' },
    ],
  })
  const result = bookDocument(book)
  expect(result.sections.map((section) => section.id)).toEqual(['section-1', 'section-2'])
  expect(result.html.match(/data-segnavia-flow=/g)).toHaveLength(1)
  expect(result.html).toContain('<div class="segnavia-section-boundary" data-mark="segnavia:section-title" data-segnavia-chapter="2" id="section-2">Two</div>')
  expect(result.html).toContain('First</p><div class="segnavia-section-boundary"')
  expect(result.html).toContain('id="section-2">Two</div><p')
})
