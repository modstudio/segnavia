import { expect, test } from 'bun:test'
import { SECTION_BOUNDARY_CLASS } from '@segnavia/format'
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
  expect(result.issues).toEqual([])
  expect(result.sections.map((section) => section.id)).toEqual(['section-1', 'section-2'])
  expect(result.html.match(/data-segnavia-flow=/g)).toHaveLength(1)
  expect(result.html).toContain(`<div class="${SECTION_BOUNDARY_CLASS}" data-segnavia-section-title="Two" data-segnavia-chapter="2" id="section-2">Two</div>`)
  expect(result.html).toContain(`First</p><div class="${SECTION_BOUNDARY_CLASS}"`)
  expect(result.html).toContain('id="section-2">Two</div><p')
})

test('joins a generated continuing part heading without forcing a page break', () => {
  const book = parseBookFixture({
    title: 'ספר',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    lang: 'he',
    dir: 'rtl',
    numbering: { parts: {} },
    body: [
      { id: 'before', title: 'לפני', html: '<p>לפני</p>' },
      { id: 'part', name: 'gate', title: 'שער', opens: 'continue', children: [] },
    ],
  })
  const result = bookDocument(book)
  expect(result.html.match(/data-segnavia-flow=/g)).toHaveLength(1)
  expect(result.html).toMatch(
    /<h1 class="segnavia-part-heading" dir="rtl"[^>]*><span class="segnavia-part-number" dir="rtl"[^>]*><bdi[^>]*>א<\/bdi><\/span> <span class="segnavia-part-title" dir="rtl"[^>]*><bdi[^>]*>שער<\/bdi><\/span><\/h1>/,
  )
  expect(bookDocument(book, { build: 'print' }).html).toContain('.segnavia-part:not([data-opens="continue"]),.segnavia-chapter')
})

test('accepts authored html on a continuing part', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    body: [
      { id: 'before', title: 'Before', html: '<p>Before</p>' },
      { id: 'part', name: 'gate', title: 'Gate', html: '<h1>Authored</h1>', opens: 'continue', children: [] },
    ],
  })
  expect(bookDocument(book).html).toContain('Before</p><div class="segnavia-section-boundary"')
  expect(bookDocument(book).html).toMatch(/<h1[^>]*>Authored<\/h1>/)
})
