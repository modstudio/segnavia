import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

test('carries section numbering as galley measurement facts', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    chapters: [
      { title: 'Cover', html: '<p>Cover</p>', numbering: { counted: false } },
      { title: 'Text', html: '<p>Text</p>', numbering: { restart: 4 } },
    ],
  })
  const html = bookDocument(book).html
  expect(html.match(/<section[^>]*id="section-1"(?:\s[^>]*)?>/)?.[0]).toContain('data-numbering-counted="false"')
  expect(html.match(/<section[^>]*id="section-2"(?:\s[^>]*)?>/)?.[0]).toContain('data-numbering-restart="4"')
})
