import { expect, test } from 'bun:test'
import { Book } from '@segnavia/format'
import { bookDocument } from './book-document.ts'

test('book parts build openings, title-only levels, ancestry and end matter in reading order', () => {
  const book = Book.parse({
    title: 'Parts',
    mode: 'continuous',
    frontMatter: [{ kind: 'contents' }],
    body: [
      {
        name: 'part',
        title: 'Outer',
        html: '<h1>Opening</h1>',
        children: [{ name: 'gate', title: 'Inner', children: [{ title: 'One', html: '<h2>Topic</h2>' }] }],
      },
    ],
    endMatter: [{ name: 'appendix', title: 'Appendix', children: [{ title: 'After', html: '<p>End</p>' }] }],
  })
  const result = bookDocument(book)

  expect(result.sections.map(({ id, kind, division }) => ({ id, kind, division }))).toEqual([
    { id: 'segnavia-contents', kind: 'contents', division: 'front' },
    { id: 'segnavia-part-1', kind: 'part', division: 'body' },
    { id: 'segnavia-chapter-1', kind: 'chapter', division: 'body' },
    { id: 'segnavia-chapter-2', kind: 'chapter', division: 'end' },
  ])
  expect(result.headings.map(({ id, text, level, depth }) => ({ id, text, level, depth }))).toEqual([
    { id: 'segnavia-part-1', text: 'Outer', level: 1, depth: 0 },
    { id: 'segnavia-chapter-1', text: 'Inner', level: 1, depth: 1 },
    { id: 'segnavia-chapter-1', text: 'One', level: 1, depth: 2 },
    { id: 'segnavia-h-1-1', text: 'Topic', level: 2, depth: 2 },
    { id: 'segnavia-chapter-2', text: 'Appendix', level: 1, depth: 0 },
    { id: 'segnavia-chapter-2', text: 'After', level: 1, depth: 1 },
  ])
  expect(result.html).toContain('data-segnavia-parts="{&quot;part&quot;:&quot;Outer&quot;,&quot;gate&quot;:&quot;Inner&quot;}"')
  expect(result.html).not.toMatch(/id="segnavia-part-[23]"/)
  expect(result.html).toContain(':where(.segnavia-part,.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}')
  expect(result.html).toContain('data-level="12"]){padding-inline-start:11em}')
})

test('every heading in a designed section inside a part carries the part depth', () => {
  const book = Book.parse({
    title: 'Parts',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
    body: [{ name: 'part', title: 'Part', children: [{ kind: 'designed', title: 'Plate', pages: [{ html: '<h2>Detail</h2>' }] }] }],
  })
  expect(bookDocument(book).headings).toEqual([
    { id: 'segnavia-designed-1', level: 1, depth: 0, text: 'Part', sectionId: 'segnavia-designed-1' },
    { id: 'segnavia-designed-1', level: 1, depth: 1, text: 'Plate', sectionId: 'segnavia-designed-1' },
    { id: 'segnavia-h-designed-1-1', level: 2, depth: 1, text: 'Detail', sectionId: 'segnavia-designed-1' },
  ])
})

test('a title-only front part targets its own first child instead of the body', () => {
  const book = Book.parse({
    title: 'Parts',
    mode: 'continuous',
    frontMatter: [{ name: 'preface', title: 'Front Part', children: [{ title: 'Preface', html: '<p>Before</p>' }] }],
    body: [{ title: 'Chapter', html: '<p>Body</p>' }],
  })
  expect(bookDocument(book).headings.map(({ id, text }) => ({ id, text }))).toEqual([
    { id: 'segnavia-front-1', text: 'Front Part' },
    { id: 'segnavia-front-1', text: 'Preface' },
    { id: 'segnavia-chapter-1', text: 'Chapter' },
  ])
})

test("a part opening's pages carry the part itself and its running-head value", () => {
  const book = Book.parse({
    title: 'Parts',
    mode: 'continuous',
    body: [{ name: 'part', title: 'Part', runningHead: 'Short Part', html: '<p>Opening</p>' }],
  })
  expect(bookDocument(book).html).toContain('data-segnavia-parts="{&quot;part&quot;:&quot;Short Part&quot;}"')
})
