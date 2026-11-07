import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

const chapter = (title: string, html: string) => ({ title, html })
const sectionOpen = (html: string, id: string) => html.match(new RegExp(`<section[^>]*id="${id}"(?:\\s[^>]*)?>`))?.[0] ?? ''

test("chapter endnotes carry their owning chapter's part and division", () => {
  const result = bookDocument(
    parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
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
  expect(result.sections.find((section) => section.id === 'segnavia-endnotes-section-2')?.division).toBe('body')
  expect(sectionOpen(result.html, 'segnavia-endnotes-section-2')).toContain('data-segnavia-parts="{&quot;part&quot;:&quot;Part One&quot;}"')
})

test('book endnotes stay before every end-matter section', () => {
  const result = bookDocument(
    parseBookFixture({
      title: 'Book',
      mode: 'continuous',
      body: [chapter('One', '<p>A<span data-note="endnote">source</span></p>')],
      endMatter: [chapter('Appendix', '<p>After</p>'), chapter('Index', '<p>Last</p>')],
    }),
  )
  expect(result.sections.map((section) => section.id)).toEqual(['section-1', 'segnavia-endnotes', 'section-2', 'section-3'])
})
