import { expect, test } from 'bun:test'
import { Book } from '@segnavia/format'
import { bookDocument } from './book-document.ts'

const chapter = (title: string, html: string) => ({ title, html })
const sectionOpen = (html: string, id: string) => html.match(new RegExp(`<section[^>]*id="${id}"(?:\\s[^>]*)?>`))?.[0] ?? ''

test("chapter endnotes carry their owning chapter's part and division", () => {
  const result = bookDocument(
    Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
      endnotes: { placement: 'chapter' },
      body: [
        {
          name: 'part',
          title: 'Part One',
          children: [chapter('One', '<p>A<span data-note="endnote">first</span></p>')],
        },
      ],
    }),
  )
  expect(result.sections.find((section) => section.id === 'segnavia-endnotes-1')?.division).toBe('body')
  expect(sectionOpen(result.html, 'segnavia-endnotes-1')).toContain('data-segnavia-parts="{&quot;part&quot;:&quot;Part One&quot;}"')
})

test('book endnotes stay before every end-matter section', () => {
  const result = bookDocument(
    Book.parse({
      title: 'Book',
      mode: 'continuous',
      body: [chapter('One', '<p>A<span data-note="endnote">source</span></p>')],
      endMatter: [chapter('Appendix', '<p>After</p>'), chapter('Index', '<p>Last</p>')],
    }),
  )
  expect(result.sections.map((section) => section.id)).toEqual(['segnavia-chapter-1', 'segnavia-endnotes', 'segnavia-chapter-2', 'segnavia-chapter-3'])
})
