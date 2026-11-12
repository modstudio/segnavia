import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

const input = (chapters: unknown[]) => ({ title: 'Book', mode: 'continuous', chapters })

test('fills page references while keeping an empty link before pagination', () => {
  const book = parseBookFixture(input([{ title: 'One', html: '<p><a href="#topic" data-ref="page"></a></p><h2 id="topic">Topic</h2>' }]))
  expect(bookDocument(book).html).toContain('<a href="#topic" data-ref="page" dir="ltr"></a>')
  expect(bookDocument(book, { pageNumbers: { topic: 'יב' } }).html).toContain('<a href="#topic" data-ref="page" dir="rtl">יב</a>')
  expect(bookDocument(book, { pageNumbers: { topic: '12' }, crossLinks: true }).html).toContain(
    '<a href="segnavia:target/topic" data-ref="page" dir="ltr">12</a>',
  )
})

test('reports missing and ambiguous page reference targets', () => {
  const missing = bookDocument(parseBookFixture(input([{ title: 'One', html: '<p><a href="#lost" data-ref="page"></a></p>' }])))
  expect(missing.issues).toContain('page reference to lost in One (section-1) has no target; add the id or remove the reference')

  const repeated = bookDocument(
    parseBookFixture(
      input([
        { title: 'One', html: '<p><a href="#topic" data-ref="page"></a><span id="topic">First</span></p>' },
        { title: 'Two', html: '<span id="topic">Second</span>' },
      ]),
    ),
  )
  expect(repeated.issues).toContain(
    'page reference target topic is used in 2 sections: One (section-1), Two (section-2); make the target id unique to clear this refusal',
  )
})

test('treats an authored contents styling class as an authored page reference', () => {
  const result = bookDocument(
    parseBookFixture(input([{ title: 'One', html: '<p><a class="segnavia-contents-page" href="#topic" data-ref="page"></a></p><h2 id="topic">Topic</h2>' }])),
  )
  expect(result.pageReferenceTargets).toEqual(['topic'])
})
