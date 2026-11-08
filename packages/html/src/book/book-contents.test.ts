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
    chapters: [{ title: 'Chapter', contentsLabel: 'פרק ראשון', subtitle: 'מבוא לספר', html: '<p>Text</p>' }],
  })
  const result = bookDocument(book)
  expect(result.headings).toEqual([{ id: 'section-2', level: 1, text: 'Chapter', contentsLabel: 'פרק ראשון', subtitle: 'מבוא לספר', sectionId: 'section-2' }])
  expect(result.html).toContain('<a href="#section-2" dir="rtl">פרק ראשון<span class="segnavia-contents-subtitle" dir="rtl">מבוא לספר</span></a>')
  const section = result.html.match(/<section[^>]*id="section-2"(?:\s[^>]*)?>/)?.[0]
  expect(section).toContain('data-contents-label="פרק ראשון" data-subtitle="מבוא לספר"')
})
