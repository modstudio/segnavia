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
