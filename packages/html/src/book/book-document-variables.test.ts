import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

test('targets nested content-variable set points with stable generated ids only in target builds', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    variables: [{ name: 'topic', kind: 'text', from: 'content', pick: 'first' }],
    chapters: [{ title: 'One', html: '<p>Text</p>' }],
  })
  const section = book.body[0]
  if (!section || !('html' in section)) throw new Error('Expected an authored section.')
  section.html = '<div><div><p data-variable="topic">  Three\n Phases </p><p id="practice" data-variable="topic">Practice</p></div></div>'
  const first = bookDocument(book, { targets: true })
  const second = bookDocument(book, { targets: true })
  expect(first.setPoints).toEqual([
    { id: 'segnavia-variable-1', name: 'topic', value: 'Three Phases', section: 'section-1' },
    { id: 'practice', name: 'topic', value: 'Practice', section: 'section-1' },
  ])
  expect(second.setPoints).toEqual(first.setPoints)
  expect(first.html).toMatch(/<p[^>]*data-variable="topic"[^>]*id="segnavia-variable-1"/)
  expect(first.html).toContain('href="#segnavia-variable-1"')
  expect(first.html).toContain('href="#practice"')
  const flow = bookDocument(book, { build: 'flow' })
  expect(flow.setPoints).toEqual([])
  expect(flow.html).not.toContain('segnavia-variable-1')
})
