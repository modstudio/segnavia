import { expect, test } from 'bun:test'
import { SECTION_BOUNDARY_CLASS, SECTION_TITLE_MARK } from '@segnavia/format'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

test('joins a continuing section to its predecessor flow with a titled boundary', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    chapters: [
      { title: 'One', html: '<p>First</p>' },
      { title: 'Two', runningHead: 'Running Two', html: '<p>Second</p>', opens: 'continue' },
    ],
  })
  const result = bookDocument(book)
  expect(result.issues).toEqual([])
  expect(result.sections.map((section) => section.id)).toEqual(['section-1', 'section-2'])
  expect(result.html.match(/data-segnavia-flow=/g)).toHaveLength(1)
  expect(result.html).toContain(
    `<div class="${SECTION_BOUNDARY_CLASS}" data-mark="${SECTION_TITLE_MARK}" data-mark-scope="flow" data-segnavia-chapter="2" id="section-2">Running Two</div>`,
  )
  expect(result.html).toContain(`First</p><div class="${SECTION_BOUNDARY_CLASS}"`)
  expect(result.html).toContain('id="section-2">Running Two</div><p')
})
