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
})
