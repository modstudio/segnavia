import { expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

test('uses a section contents label and independently resolves its subtitle direction', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    lang: 'en',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    chapters: [{ title: 'Chapter', contentsLabel: 'פרק ראשון', subtitle: 'Introduction', html: '<p>Text</p>' }],
  })
  const result = bookDocument(book)
  expect(result.headings).toEqual([
    { id: 'section-2', level: 1, text: 'Chapter', contentsLabel: 'פרק ראשון', subtitle: 'Introduction', sectionId: 'section-2' },
  ])
  expect(result.html).toContain('<a href="#section-2" dir="rtl">פרק ראשון<span class="segnavia-contents-subtitle" dir="ltr">Introduction</span></a>')
})

test('an unlabeled contents entry takes its title direction before the book language', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    lang: 'en',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    chapters: [{ title: 'פרק', html: '<p>Text</p>' }],
  })
  expect(bookDocument(book).html).toContain('<a href="#section-2" dir="rtl">פרק')
})

test('falls back to the book direction when a contents label has no strong letter', () => {
  const book = parseBookFixture({
    title: 'ספר',
    mode: 'paginated',
    dir: 'rtl',
    lang: 'he',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ kind: 'contents', title: 'תוכן' }],
    chapters: [{ title: 'פרק', contentsLabel: '1948', html: '<p>טקסט</p>' }],
  })
  expect(bookDocument(book).html).toContain('<a href="#section-2" dir="rtl">1948')
})
