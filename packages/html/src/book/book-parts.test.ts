import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

test('book parts build openings, title-only levels, ancestry and end matter in reading order', () => {
  const book = parseBookFixture({
    title: 'Parts',
    mode: 'continuous',
    frontMatter: [{ kind: 'contents' }],
    body: [
      {
        id: 'outer-part',
        name: 'part',
        title: 'Outer',
        html: '<h1>Opening</h1>',
        children: [{ name: 'gate', title: 'Inner', children: [{ title: 'One', html: '<h2 data-segnavia-id="topic-heading">Topic</h2>' }] }],
      },
    ],
    endMatter: [{ name: 'appendix', title: 'Appendix', children: [{ title: 'After', html: '<p>End</p>' }] }],
  })
  const result = bookDocument(book)

  expect(result.sections.map(({ id, kind, division }) => ({ id, kind, division }))).toEqual([
    { id: 'section-1', kind: 'contents', division: 'front' },
    { id: 'outer-part', kind: 'part', division: 'body' },
    { id: 'section-3', kind: 'chapter', division: 'body' },
    { id: 'section-5', kind: 'chapter', division: 'end' },
  ])
  expect(result.headings.map(({ id, text, level, depth }) => ({ id, text, level, depth }))).toEqual([
    { id: 'outer-part', text: 'Outer', level: 1, depth: 0 },
    { id: 'section-3', text: 'Inner', level: 1, depth: 1 },
    { id: 'section-3', text: 'One', level: 1, depth: 2 },
    { id: 'topic-heading', text: 'Topic', level: 2, depth: 2 },
    { id: 'section-5', text: 'Appendix', level: 1, depth: 0 },
    { id: 'section-5', text: 'After', level: 1, depth: 1 },
  ])
  expect(result.html).toContain('data-segnavia-parts="{&quot;part&quot;:&quot;Outer&quot;,&quot;gate&quot;:&quot;Inner&quot;}"')
  expect(result.sections.find(({ id }) => id === 'outer-part')?.parts).toEqual({ part: 'Outer' })
  expect(result.sections.find(({ id }) => id === 'section-3')?.parts).toEqual({ part: 'Outer', gate: 'Inner' })
  expect(result.html).not.toMatch(/id="inner-part"/)
  expect(result.html).toContain(':where(.segnavia-part,.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}')
  expect(result.html).toContain('data-level="12"]){padding-inline-start:11em}')
})

test('every heading in a designed section inside a part carries the part depth', () => {
  const book = parseBookFixture({
    title: 'Parts',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    body: [
      { name: 'part', title: 'Part', children: [{ kind: 'designed', title: 'Plate', pages: [{ html: '<h2 data-segnavia-id="detail-heading">Detail</h2>' }] }] },
    ],
  })
  expect(bookDocument(book).headings).toEqual([
    { id: 'section-2', level: 1, depth: 0, text: 'Part', sectionId: 'section-2' },
    { id: 'section-2', level: 1, depth: 1, text: 'Plate', sectionId: 'section-2' },
    { id: 'detail-heading', level: 2, depth: 1, text: 'Detail', sectionId: 'section-2' },
  ])
})

test('a title-only front part targets its own first child instead of the body', () => {
  const book = parseBookFixture({
    title: 'Parts',
    mode: 'continuous',
    frontMatter: [{ name: 'preface', title: 'Front Part', children: [{ title: 'Preface', html: '<p>Before</p>' }] }],
    body: [{ title: 'Chapter', html: '<p>Body</p>' }],
  })
  expect(bookDocument(book).headings.map(({ id, text }) => ({ id, text }))).toEqual([
    { id: 'section-2', text: 'Front Part' },
    { id: 'section-2', text: 'Preface' },
    { id: 'section-3', text: 'Chapter' },
  ])
})

test("a part opening's pages carry the part itself and its title", () => {
  const book = parseBookFixture({
    title: 'Parts',
    mode: 'continuous',
    body: [{ name: 'part', title: 'Part', html: '<p>Opening</p>' }],
  })
  const result = bookDocument(book)
  expect(result.html).toContain('data-segnavia-parts="{&quot;part&quot;:&quot;Part&quot;}"')
  expect(result.sections[0]?.parts).toEqual({ part: 'Part' })
})
