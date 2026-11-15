import { expect, test } from 'bun:test'
import { bookOutlineSource } from '../document-outline.ts'
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
    {
      id: 'section-2',
      block: 'section-2',
      level: 1,
      text: 'Chapter',
      contentsLabel: 'פרק ראשון',
      subtitle: 'Introduction',
      sectionId: 'section-2',
      listed: { contents: true, outline: true },
    },
  ])
  expect(result.html).toContain('<a href="#section-2" dir="rtl">פרק ראשון<span class="segnavia-contents-subtitle" dir="ltr">Introduction</span></a>')
})

test('prints chapter numbers in contents and outline only when opted in', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    numbering: { chapters: {} },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    chapters: [
      { title: 'One', html: '<p>One</p>' },
      { title: 'Two', html: '<p>Two</p>' },
    ],
  })
  const built = bookDocument(book)
  expect(built.html).toContain('<span class="segnavia-contents-number"><bdi>1</bdi></span> One')
  expect(built.html).toContain('<span class="segnavia-contents-number"><bdi>2</bdi></span> Two')
  expect(bookOutlineSource(book, built).headings.map(({ title }) => title)).toEqual(['1 One', '2 Two'])
})

test('lists a book-placed notes section in reading order with its label, page and outline entry', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    body: [{ title: 'Chapter', html: '<p>Text<span data-note="endnote">Source</span></p>' }],
    endMatter: [{ title: 'Appendix', html: '<p>After</p>' }],
    notes: [{ name: 'endnote', contentsLabel: 'References' }],
  })
  const built = bookDocument(book, { pageNumbers: { 'segnavia-endnotes': '12' } })
  expect(built.headings.map(({ id, text, contentsLabel }) => ({ id, text, contentsLabel }))).toEqual([
    { id: 'section-2', text: 'Chapter', contentsLabel: undefined },
    { id: 'segnavia-endnotes', text: 'Notes', contentsLabel: 'References' },
    { id: 'section-3', text: 'Appendix', contentsLabel: undefined },
  ])
  expect(built.html).toContain('<a href="#segnavia-endnotes" dir="ltr">References</a>')
  expect(built.html).toContain(
    '<a class="segnavia-contents-page" data-segnavia-generated-contents-page href="#segnavia-endnotes" data-ref="page" dir="ltr">12</a>',
  )
  expect(bookOutlineSource(book, built).headings.map(({ title }) => title)).toEqual(['Chapter', 'References', 'Appendix'])
})

test('omits opted-out and chapter-placed notes while keeping their printed sections', () => {
  const hiddenBook = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    chapters: [{ title: 'Chapter', html: '<p>Text<span data-note="endnote">Source</span></p>' }],
    notes: [{ name: 'endnote', contents: false }],
  })
  const hidden = bookDocument(hiddenBook)
  expect(hidden.html).toContain('id="segnavia-endnotes"')
  expect(hidden.html).not.toContain('href="#segnavia-endnotes"')
  expect(hidden.headings.some(({ id }) => id === 'segnavia-endnotes')).toBeFalse()
  expect(bookOutlineSource(hiddenBook, hidden).headings.map(({ title }) => title)).toEqual(['Chapter'])

  const chapterPlaced = bookDocument(
    parseBookFixture({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
      frontMatter: [{ kind: 'contents', title: 'Contents' }],
      chapters: [{ title: 'Chapter', html: '<p>Text<span data-note="endnote">Source</span></p>' }],
      endnotes: { placement: 'chapter' },
    }),
  )
  expect(chapterPlaced.html).toContain('id="segnavia-endnotes-section-2"')
  expect(chapterPlaced.headings.some(({ id }) => id.startsWith('segnavia-endnotes'))).toBeFalse()

  const withoutNotes = bookDocument(
    parseBookFixture({ title: 'Book', mode: 'continuous', frontMatter: [{ kind: 'contents' }], chapters: [{ title: 'Chapter', html: '<p>Text</p>' }] }),
  )
  expect(withoutNotes.html).not.toContain('id="segnavia-endnotes"')
  expect(withoutNotes.headings.some(({ id }) => id === 'segnavia-endnotes')).toBeFalse()
})

test('keeps chapter-placed front-matter notes unlisted at book end', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [
      { kind: 'contents', title: 'Contents' },
      { title: 'Preface', html: '<p>Front<span data-note="endnote">Source</span></p>' },
    ],
    body: [{ title: 'Chapter', html: '<p>Text</p>' }],
    endnotes: { placement: 'chapter' },
  })
  const built = bookDocument(book)
  expect(built.html).toContain('id="segnavia-endnotes"')
  expect(built.html).not.toContain('href="#segnavia-endnotes"')
  expect(built.headings.some(({ id }) => id.startsWith('segnavia-endnotes'))).toBeFalse()
  expect(bookOutlineSource(book, built).headings.map(({ title }) => title)).toEqual(['Preface', 'Chapter'])
})

test('keeps part-placed notes outside a part unlisted at book end', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    body: [{ title: 'Chapter', html: '<p>Text<span data-note="sources">Source</span></p>' }],
    notes: [{ name: 'sources', placement: 'part', numbering: 'part', title: 'Sources' }],
  })
  const built = bookDocument(book)
  expect(built.html).toContain('id="segnavia-notes-sources"')
  expect(built.html).not.toContain('href="#segnavia-notes-sources"')
  expect(built.headings.some(({ id }) => id.startsWith('segnavia-notes-sources'))).toBeFalse()
  expect(bookOutlineSource(book, built).headings.map(({ title }) => title)).toEqual(['Chapter'])
})

test('lists multiple book-placed note series once in declaration and reading order', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    body: [{ title: 'Chapter', html: '<p>Text<span data-note="endnote">Comment</span><span data-note="sources">Source</span></p>' }],
    endMatter: [{ title: 'Appendix', html: '<p>After</p>' }],
    notes: [{ name: 'sources', placement: 'book', numbering: 'book', title: 'Sources' }],
  })
  const built = bookDocument(book)
  expect(built.headings.map(({ id }) => id)).toEqual(['section-2', 'segnavia-endnotes', 'segnavia-notes-sources', 'section-3'])
  expect(bookOutlineSource(book, built).headings.map(({ title }) => title)).toEqual(['Chapter', 'Notes', 'Sources', 'Appendix'])
})

test('uses the note title direction and respects contents depth and disabled generated contents', () => {
  const input = {
    title: 'ספר',
    mode: 'paginated' as const,
    lang: 'he',
    page: { paper: 'a5' as const, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    chapters: [{ title: 'פרק', html: '<p>טקסט<span data-note="endnote">מקור</span></p>' }],
  }
  const withContents = bookDocument(parseBookFixture({ ...input, contents: { depth: 1 }, frontMatter: [{ kind: 'contents', title: 'תוכן' }] }))
  expect(withContents.html).toContain('<a href="#segnavia-endnotes" dir="rtl">הערות</a>')

  const withoutContents = bookDocument(parseBookFixture(input))
  expect(withoutContents.headings.some(({ id }) => id === 'segnavia-endnotes')).toBeTrue()
  expect(withoutContents.html).not.toContain('href="#segnavia-endnotes"')
})

test('prints isolated Hebrew numbers and a part contents label', () => {
  const book = parseBookFixture({
    title: 'ספר',
    mode: 'continuous',
    lang: 'he',
    dir: 'rtl',
    numbering: { parts: {}, chapters: {} },
    frontMatter: [{ kind: 'contents', title: 'תוכן' }],
    body: [{ id: 'part', name: 'one', title: 'חלק', contentsLabel: 'שער', children: [{ id: 'chapter', title: 'פרק', html: '<p>טקסט</p>' }] }],
  })
  const built = bookDocument(book)
  expect(built.html).toContain('<span class="segnavia-contents-number"><bdi>א</bdi></span> שער')
  expect(built.html).toContain('<span class="segnavia-contents-number"><bdi>א</bdi></span> פרק')
  expect(bookOutlineSource(book, built).headings.map(({ title }) => title)).toEqual(['א שער', 'א פרק'])
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

test('a Hebrew label and subtitle in an English contents list both resolve rtl', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    lang: 'en',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    chapters: [{ title: 'Chapter', contentsLabel: 'פרק ראשון', subtitle: 'הקדמה', html: '<p>Text</p>' }],
  })
  expect(bookDocument(book).html).toContain('<a href="#section-2" dir="rtl">פרק ראשון<span class="segnavia-contents-subtitle" dir="rtl">הקדמה</span></a>')
})

test('a section contentsDepth caps its entries without raising the book depth', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    contents: { depth: 3 },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    chapters: [
      { title: 'Capped', contentsDepth: 1, html: '<h2 id="capped-two">Capped two</h2><h3 id="capped-three">Capped three</h3>' },
      { title: 'Open', html: '<h2 id="open-two">Open two</h2><h3 id="open-three">Open three</h3>' },
    ],
  })
  const html = bookDocument(book).html
  expect(html).toContain('href="#section-2"')
  expect(html).not.toContain('href="#capped-two"')
  expect(html).not.toContain('href="#capped-three"')
  expect(html).toContain('href="#open-two"')
  expect(html).toContain('href="#open-three"')

  const shallow = bookDocument(
    parseBookFixture({
      title: 'Book',
      mode: 'continuous',
      contents: { depth: 2 },
      frontMatter: [{ kind: 'contents', title: 'Contents' }],
      chapters: [{ title: 'Chapter', contentsDepth: 4, html: '<h2 id="kept">Kept</h2><h3 id="too-deep">Too deep</h3>' }],
    }),
  ).html
  expect(shallow).toContain('href="#kept"')
  expect(shallow).not.toContain('href="#too-deep"')
})

test('a designed section contentsDepth caps its page headings and contents false still wins', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    contents: { depth: 6 },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    body: [
      {
        kind: 'designed',
        title: 'Designed',
        contentsDepth: 2,
        pages: [{ html: '<h1 id="designed-one">One</h1><h2 id="designed-two">Two</h2><h3 id="designed-three">Three</h3>' }],
      },
      { title: 'Hidden', contents: false, contentsDepth: 6, html: '<h2 id="hidden-two">Hidden two</h2>' },
    ],
  })
  const html = bookDocument(book).html
  expect(html).toContain('href="#designed-one"')
  expect(html).toContain('href="#designed-two"')
  expect(html).not.toContain('href="#designed-three"')
  expect(html).not.toContain('href="#hidden-two"')
})

test('a designed section capped at 1 keeps its page h1, which shares the title level', () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } },
    contents: { depth: 6 },
    frontMatter: [{ kind: 'contents', title: 'Contents' }],
    body: [{ kind: 'designed', title: 'Designed', contentsDepth: 1, pages: [{ html: '<h1 id="designed-one">One</h1><h2 id="designed-two">Two</h2>' }] }],
  })
  const html = bookDocument(book).html
  expect(html).toContain('href="#designed-one"')
  expect(html).not.toContain('href="#designed-two"')
})

test('a capped right-to-left chapter lists only its expected Hebrew entries', () => {
  const book = parseBookFixture({
    title: 'ספר',
    mode: 'continuous',
    dir: 'rtl',
    lang: 'he',
    contents: { depth: 3 },
    frontMatter: [{ kind: 'contents', title: 'תוכן' }],
    chapters: [{ title: 'פרק', contentsDepth: 2, html: '<h2 id="נושא">נושא</h2><h3 id="פרט">פרט</h3>' }],
  })
  const html = bookDocument(book).html
  expect(html).toContain('<a href="#נושא" dir="rtl">נושא')
  expect(html).not.toContain('href="#פרט"')
})
