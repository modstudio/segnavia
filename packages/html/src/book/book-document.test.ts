import { describe, expect, test } from 'bun:test'
import { Book, type BookInput } from '@segnavia/format'
import { bookDocument } from './book-document.ts'

const chapter = (title: string, html = '<p>Text</p>') => ({ title, html })
const sectionOpen = (html: string, id: string) => html.match(new RegExp(`<section[^>]*id="${id}"(?:\\s[^>]*)?>`))?.[0] ?? ''
const input = (overrides: Partial<BookInput> = {}): BookInput => ({
  title: 'Book',
  mode: 'continuous',
  chapters: [chapter('One'), chapter('Two')],
  ...overrides,
})

describe('book document', () => {
  test('orders front matter, contents, chapters and endnotes with stable ids', () => {
    const book = Book.parse(
      input({
        frontMatter: [
          { title: 'Preface', html: '<p>Before</p>' },
          { kind: 'contents', title: 'Contents' },
        ],
        chapters: [chapter('One', '<p>Text<span data-note="endnote">Source</span></p>')],
      }),
    )
    const result = bookDocument(book)
    expect(result.sections).toEqual([
      { id: 'segnavia-front-1', kind: 'front', title: 'Preface', runningHead: 'Preface' },
      { id: 'segnavia-contents', kind: 'contents', title: 'Contents', runningHead: 'Contents' },
      { id: 'segnavia-chapter-1', kind: 'chapter', title: 'One', runningHead: 'One' },
      { id: 'segnavia-endnotes', kind: 'endnotes', title: 'Notes', runningHead: 'Notes' },
    ])
    expect([...result.html.matchAll(/<section[^>]+id="([^"]+)"/g)].map((match) => match[1])).toEqual(result.sections.map((section) => section.id))
  })

  test('lists contents levels through depth, excluding opted-out and chapter h1 headings while keeping an author id', () => {
    const html =
      '<h1>Author chapter title</h1><h2 id="kept">Alpha <span data-note="footnote">not in heading</span></h2><h3>Beta</h3><h3 data-contents="exclude">No</h3><h4>Deep</h4>'
    const result = bookDocument(Book.parse(input({ chapters: [chapter('Chapter title', html)], contents: { depth: 3 } })))
    expect(result.headings).toEqual([
      { id: 'segnavia-chapter-1', level: 1, text: 'Chapter title', sectionId: 'segnavia-chapter-1' },
      { id: 'kept', level: 2, text: 'Alpha', sectionId: 'segnavia-chapter-1' },
      { id: 'segnavia-h-1-2', level: 3, text: 'Beta', sectionId: 'segnavia-chapter-1' },
    ])
    expect(result.html).toMatch(/<h1[^>]*>Author chapter title<\/h1>/)
    expect(result.html).toMatch(/<h2 id="kept"[^>]*>/)
    expect(result.html).not.toContain('href="#segnavia-h-1-3"')
  })

  test('numbers footnotes per chapter or through the book with the configured marker kinds', () => {
    const chapters = [chapter('One', '<p>A<span data-note="footnote">a</span></p>'), chapter('Two', '<p>B<span data-note="footnote">b</span></p>')]
    const restarted = bookDocument(Book.parse(input({ chapters, footnotes: { marker: 'roman-lower', restart: 'chapter' } }))).html
    expect(restarted).toContain('id="segnavia-fn-1-1"')
    expect(restarted).toContain('id="segnavia-fn-2-1"')
    expect(restarted.match(/<bdi>i<\/bdi>/g)).toHaveLength(4)

    const through = bookDocument(Book.parse(input({ chapters, footnotes: { marker: 'arabic', restart: 'book' } }))).html
    expect(through).toContain('id="segnavia-fn-2-2"')
    expect(through).toContain('<bdi>2</bdi>')
  })

  test('writes Hebrew footnote and endnote markers', () => {
    const html = '<p>A<span data-note="footnote">f</span> B<span data-note="endnote">e</span></p>'
    const result = bookDocument(Book.parse(input({ lang: 'he', chapters: [chapter('פרק', html)], endnotes: { marker: 'hebrew' } })))
    expect(result.html.match(/<bdi>א<\/bdi>/g)).toHaveLength(4)
  })

  test('places footnote blocks after a paragraph, inside a list item, and shares one block for two notes', () => {
    const html =
      '<p>A<span data-note="footnote">first</span> B<span data-note="footnote"><i>second</i></span></p><ul><li>C<span data-note="footnote">third</span></li></ul>'
    const result = bookDocument(Book.parse(input({ chapters: [chapter('One', html)] }))).html
    expect(result).toMatch(
      /<p[^>]*>A<sup[\s\S]*?<\/p><div class="segnavia-footnotes"[^>]*><p class="segnavia-footnote"[^>]*>[\s\S]*?first<\/p><p class="segnavia-footnote"[^>]*>[\s\S]*?<i>second<\/i><\/p><\/div>/,
    )
    expect(result).toMatch(/<li>C<sup[\s\S]*?<div class="segnavia-footnotes">[\s\S]*?third[\s\S]*?<\/div><\/li>/)
    expect(result.match(/class="segnavia-footnotes"/g)).toHaveLength(2)
  })

  test('collects endnotes in a titled section with links in both directions', () => {
    const result = bookDocument(Book.parse(input({ chapters: [chapter('One', '<p>Text<span data-note="endnote"><em>Source</em></span></p>')] }))).html
    expect(result).toContain('<a id="segnavia-enref-1" href="#segnavia-en-1"><bdi>1</bdi></a>')
    expect(result).toMatch(/<h1 class="segnavia-endnotes-title" dir="ltr"[^>]*>Notes<\/h1>/)
    expect(result).toMatch(/<p class="segnavia-endnote" id="segnavia-en-1"[^>]*><a href="#segnavia-enref-1"><bdi>1<\/bdi><\/a> <em>Source<\/em><\/p>/)
  })

  test('fills contents page numbers only when enabled', () => {
    const withNumbers = Book.parse(input({ frontMatter: [{ kind: 'contents' }], chapters: [chapter('One', '<h2 id="topic">Topic</h2>')] }))
    expect(bookDocument(withNumbers, { pageNumbers: { 'segnavia-chapter-1': '7', topic: '8' } }).html).toContain(
      '<span class="segnavia-contents-page" data-target="topic" dir="ltr">8</span>',
    )
    const withoutNumbers = Book.parse(
      input({ frontMatter: [{ kind: 'contents' }], chapters: [chapter('One', '<h2 id="topic">Topic</h2>')], contents: { pageNumbers: false } }),
    )
    expect(bookDocument(withoutNumbers, { pageNumbers: { topic: '8' } }).html).toContain(
      '<span class="segnavia-contents-page" data-target="topic" dir="ltr"></span>',
    )
  })

  test('inserts requested blank pages immediately before their sections', () => {
    const result = bookDocument(Book.parse(input()), { blankBefore: ['segnavia-chapter-2'] }).html
    expect(result).toContain(
      '</section><div class="segnavia-blank" aria-hidden="true"></div><section class="segnavia-section segnavia-chapter" id="segnavia-chapter-2">',
    )
    for (const css of ['@media print', ':where(.segnavia-chapter,.segnavia-endnotes,.segnavia-blank){break-before:page}']) expect(result).toContain(css)
    for (const attribute of ['data-segnavia-flow', 'data-segnavia-position']) expect(result).not.toContain(attribute)
  })
  test('reports an issue when both used note kinds share a marker', () => {
    const html = '<p><span data-note="footnote">f</span><span data-note="endnote">e</span></p>'
    const result = bookDocument(Book.parse(input({ chapters: [chapter('One', html)], footnotes: { marker: 'arabic' }, endnotes: { marker: 'arabic' } })))
    expect(result.issues).toEqual(['footnote and endnote markers are both arabic; the two must differ when both kinds are used'])
  })
  test('reports duplicate listed heading ids and collisions with generated ids by section', () => {
    const repeated = bookDocument(Book.parse(input({ chapters: [chapter('One', '<h2 id="topic">First</h2>'), chapter('Two', '<h2 id="topic">Second</h2>')] })))
    expect(repeated.issues).toEqual([
      'destination id topic is used in both One (segnavia-chapter-1) and Two (segnavia-chapter-2); listed heading and generated destination ids must be unique',
    ])

    const generated = bookDocument(
      Book.parse(
        input({ chapters: [chapter('One', '<h2 id="segnavia-fn-2-1">Topic</h2>'), chapter('Two', '<p>Text<span data-note="footnote">Note</span></p>')] }),
      ),
    )
    expect(generated.issues).toEqual([
      'authored id segnavia-fn-2-1 in One (segnavia-chapter-1) uses the reserved segnavia- prefix',
      'destination id segnavia-fn-2-1 is used in both One (segnavia-chapter-1) and Two (segnavia-chapter-2); listed heading and generated destination ids must be unique',
    ])
  })

  test("places each chapter's endnotes as its last section, opening on either side with the chapter running head", () => {
    const result = bookDocument(
      Book.parse(
        input({
          mode: 'paginated',
          page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
          endnotes: { placement: 'chapter' },
          chapters: [
            { title: 'One', runningHead: 'I', html: '<p>A<span data-note="endnote">first</span></p>' },
            chapter('Two', '<p>B<span data-note="endnote">second</span></p>'),
          ],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.sections).toEqual([
      { id: 'segnavia-chapter-1', kind: 'chapter', title: 'One', runningHead: 'I' },
      { id: 'segnavia-endnotes-1', kind: 'endnotes', title: 'Notes', runningHead: 'I' },
      { id: 'segnavia-chapter-2', kind: 'chapter', title: 'Two', runningHead: 'Two' },
      { id: 'segnavia-endnotes-2', kind: 'endnotes', title: 'Notes', runningHead: 'Two' },
    ])
    const first = sectionOpen(result.html, 'segnavia-endnotes-1')
    const second = sectionOpen(result.html, 'segnavia-endnotes-2')
    expect(first).toContain('data-opens="any"')
    expect(first).toContain('data-running-head="I"')
    expect(second).toContain('data-opens="any"')
    expect(second).toContain('data-running-head="Two"')
    expect(result.html).toContain('id="segnavia-en-1"')
    expect(result.html).toContain('id="segnavia-en-2"')
    expect(sectionOpen(result.html, 'segnavia-endnotes')).toBe('')
    expect(result.html).toContain('max-block-size:var(--segnavia-text-height)')
    expect(result.html).toContain('[data-segnavia-page-note] img')
  })

  test("places a designed chapter entry's endnotes after it under chapter placement", () => {
    const result = bookDocument(
      Book.parse(
        input({
          mode: 'paginated',
          page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
          endnotes: { placement: 'chapter' },
          chapters: [
            { kind: 'designed', title: 'Spread', pages: [{ html: '<p>Art<span data-note="endnote">source</span></p>' }] },
            chapter('One', '<p>B<span data-note="endnote">later</span></p>'),
          ],
        }),
      ),
    )
    expect(result.sections).toEqual([
      { id: 'segnavia-designed-1', kind: 'designed', title: 'Spread', runningHead: 'Spread' },
      { id: 'segnavia-endnotes-designed-1', kind: 'endnotes', title: 'Notes', runningHead: 'Spread' },
      { id: 'segnavia-chapter-1', kind: 'chapter', title: 'One', runningHead: 'One' },
      { id: 'segnavia-endnotes-1', kind: 'endnotes', title: 'Notes', runningHead: 'One' },
    ])
    const tag = sectionOpen(result.html, 'segnavia-endnotes-designed-1')
    expect(tag).toContain('data-opens="any"')
    expect(tag).toContain('data-running-head="Spread"')
    expect(result.html).toContain('id="segnavia-en-1"')
    expect(result.html).toContain('id="segnavia-en-2"')
  })

  test('reports authored ids that use the reserved library prefix', () => {
    const result = bookDocument(
      Book.parse(input({ chapters: [chapter('One', '<div id="segnavia-fn-1-1">Authored</div><p>Text<span data-note="footnote">Note</span></p>')] })),
    )
    expect(result.issues).toContain('authored id segnavia-fn-1-1 in One (segnavia-chapter-1) uses the reserved segnavia- prefix')
  })

  test("uses a Hebrew book's resolved endnotes title and direction", () => {
    const result = bookDocument(Book.parse(input({ lang: 'he', chapters: [chapter('א', '<p><span data-note="endnote">ה</span></p>')] })))
    expect(result.html).toMatch(/<h1 class="segnavia-endnotes-title" dir="rtl"[^>]*>הערות<\/h1>/)
    expect(result.sections.at(-1)?.title).toBe('הערות')
  })

  test('selects a print part while metadata still describes the whole book', () => {
    const book = Book.parse(input({ frontMatter: [{ title: 'Preface', html: '<p>Front</p>' }, { kind: 'contents' }] }))
    const front = bookDocument(book, { part: 'front' })
    const body = bookDocument(book, { part: 'body' })
    expect(front.sections).toEqual(body.sections)
    expect(front.headings).toEqual(body.headings)
    expect(front.html).toContain('Front')
    expect(front.html).not.toContain('id="segnavia-chapter-1"')
    expect(body.html).not.toContain('Front')
    expect(body.html).toContain('id="segnavia-chapter-1"')
  })

  test('writes cross-print contents links and hidden links to selected targets', () => {
    const book = Book.parse(
      input({
        frontMatter: [{ kind: 'contents' }],
        chapters: [chapter('One', '<h2 id="topic">Topic</h2><p>A<span data-note="footnote">f</span><span data-note="endnote">e</span></p>')],
      }),
    )
    expect(bookDocument(book, { part: 'front', crossLinks: true }).html).toContain('href="segnavia:target/topic"')
    const body = bookDocument(book, { part: 'body', targets: true }).html
    for (const id of ['segnavia-chapter-1', 'topic', 'segnavia-fn-1-1', 'segnavia-fnref-1-1', 'segnavia-en-1', 'segnavia-enref-1']) {
      expect(body).toContain(`href="#${id}" tabindex="-1"`)
    }
    expect(bookDocument(book, { build: 'galley', targets: true }).html).toMatch(/inline-size:1px.*class="segnavia-targets"/)
  })
  test('a paginated document keeps footnote refs in the flow and moves notes to a notes galley', () => {
    const book = Book.parse(
      input({
        mode: 'paginated',
        page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
        chapters: [chapter('One', '<p>A<span data-note="footnote">note</span></p>')],
      }),
    )
    const result = bookDocument(book)
    expect(result.html).toContain('data-segnavia-galleys')
    expect(result.html).toContain('data-segnavia-flow="segnavia-chapter-1"')
    expect(result.html).toContain('id="segnavia-fnref-1-1"')
    expect(result.html).toContain('data-segnavia-notes-galley')
    expect(result.html).toContain('data-segnavia-note="segnavia-fn-1-1"')
    expect(result.html).not.toContain('class="segnavia-footnotes"')
    expect(result.html).not.toContain('break-before:page')
  })

  test('reports a data-columns value that is not an integer from 2 to 4, naming the block', () => {
    const issues = (html: string) => bookDocument(Book.parse(input({ chapters: [chapter('One', html)] }))).issues
    expect(issues('<p data-columns="2">Two</p>')).toEqual([])
    expect(issues('<p data-columns="4">Four</p>')).toEqual([])
    expect(issues('<p>None</p>')).toEqual([])
    expect(issues('<p data-columns="5">Wide</p>')).toEqual([
      'The p in One (segnavia-chapter-1) could not establish data-columns "5"; set it to an integer from 2 to 4 to clear this',
    ])
    expect(issues('<div data-columns="1">Single</div>')).toEqual([
      'The div in One (segnavia-chapter-1) could not establish data-columns "1"; set it to an integer from 2 to 4 to clear this',
    ])
    expect(issues('<p data-columns="two">Words</p>')).toEqual([
      'The p in One (segnavia-chapter-1) could not establish data-columns "two"; set it to an integer from 2 to 4 to clear this',
    ])
  })

  test('emits designed pages as hidden holders and lists their title and headings', () => {
    const book = Book.parse(
      input({
        mode: 'paginated',
        page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
        frontMatter: [{ kind: 'contents' }],
        chapters: [
          {
            kind: 'designed',
            title: 'Spread',
            opens: 'verso',
            pages: [{ html: '<h1 id="open">Open</h1>' }, { html: '<h2>Inside</h2>' }],
          },
          chapter('One'),
        ],
      }),
    )
    const result = bookDocument(book)
    expect(result.sections.map((section) => ({ id: section.id, kind: section.kind }))).toEqual([
      { id: 'segnavia-contents', kind: 'contents' },
      { id: 'segnavia-designed-1', kind: 'designed' },
      { id: 'segnavia-chapter-1', kind: 'chapter' },
    ])
    expect(result.html).toContain('data-segnavia-kind="fixed"')
    expect(result.html).toContain('data-opens="verso"')
    expect(result.html).toContain('data-segnavia-designed-page="1"')
    expect(result.html).toContain('data-segnavia-designed-page="2"')
    expect(result.html).toContain('hidden')
    expect(result.headings).toEqual([
      { id: 'segnavia-designed-1', level: 1, text: 'Spread', sectionId: 'segnavia-designed-1' },
      { id: 'open', level: 1, text: 'Open', sectionId: 'segnavia-designed-1' },
      { id: 'segnavia-h-designed-1-2', level: 2, text: 'Inside', sectionId: 'segnavia-designed-1' },
      { id: 'segnavia-chapter-1', level: 1, text: 'One', sectionId: 'segnavia-chapter-1' },
    ])
  })

  test('counts chapters only when a designed section sits among them', () => {
    const book = Book.parse(
      input({
        mode: 'paginated',
        page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
        chapters: [chapter('One'), { kind: 'designed', pages: [{ html: '<p>Art</p>' }] }, chapter('Two')],
      }),
    )
    expect(bookDocument(book).sections.map((section) => section.id)).toEqual(['segnavia-chapter-1', 'segnavia-designed-1', 'segnavia-chapter-2'])
  })

  test('emits templates and templated page region holders, and lists their title and headings', () => {
    const book = Book.parse(
      input({
        mode: 'paginated',
        page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
        frontMatter: [{ kind: 'contents' }],
        templates: [{ name: 'lesson', html: '<div data-region="heading"></div><div data-region="reading-text"></div>' }],
        chapters: [
          {
            kind: 'templated',
            title: 'Lessons',
            template: 'lesson',
            pages: [
              { regions: { heading: '<h1 id="lesson-1">One</h1>', 'reading-text': '<p>Read</p>' } },
              { template: 'lesson', regions: { heading: '<h2>Two</h2>' } },
            ],
          },
          chapter('One'),
        ],
      }),
    )
    const result = bookDocument(book)
    expect(result.sections.map((section) => ({ id: section.id, kind: section.kind }))).toEqual([
      { id: 'segnavia-contents', kind: 'contents' },
      { id: 'segnavia-templated-1', kind: 'templated' },
      { id: 'segnavia-chapter-1', kind: 'chapter' },
    ])
    expect(result.html).toContain('data-segnavia-template="lesson"')
    expect(result.html).toContain('data-segnavia-kind="templated"')
    expect(result.html).toContain('data-segnavia-templated-page="1"')
    expect(result.html).toContain('data-segnavia-templated-page="2"')
    expect(result.html).toContain('data-template="lesson"')
    expect(result.headings).toEqual([
      { id: 'segnavia-templated-1', level: 1, text: 'Lessons', sectionId: 'segnavia-templated-1' },
      { id: 'lesson-1', level: 1, text: 'One', sectionId: 'segnavia-templated-1' },
      { id: 'segnavia-h-templated-1-2', level: 2, text: 'Two', sectionId: 'segnavia-templated-1' },
      { id: 'segnavia-chapter-1', level: 1, text: 'One', sectionId: 'segnavia-chapter-1' },
    ])
  })

  test('refuses a template data-region that is not an HTML name token', () => {
    const book = Book.parse(
      input({
        mode: 'paginated',
        page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
        templates: [{ name: 'lesson', html: '<div data-region="reading text"></div>' }],
        chapters: [chapter('One')],
      }),
    )
    expect(bookDocument(book).issues).toEqual([
      'template "lesson" marks region "reading text" which is not an HTML name token; use a letter followed by letters, digits, hyphens or underscores to clear this refusal',
    ])
  })

  test('reports parent mark placement issues', () => {
    const book = Book.parse(input({ parentPages: [{ name: 'body', head: '<span data-motif="segnavia:mark"></span>' }] }))
    expect(bookDocument(book).issues[0]).toContain('mark has an empty name')
  })

  test('refuses a page that fills a region its template does not declare', () => {
    const book = Book.parse(
      input({
        mode: 'paginated',
        page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 10, outer: 10 } },
        templates: [{ name: 'lesson', html: '<div data-region="heading"></div>' }],
        chapters: [
          {
            kind: 'templated',
            title: 'Lessons',
            template: 'lesson',
            pages: [{ regions: { heading: '<h1 id="one">One</h1>', extra: '<p>More</p>' } }],
          },
        ],
      }),
    )
    expect(bookDocument(book).issues).toEqual([
      'section Lessons page 1 fills region "extra" which template "lesson" does not declare; add that region to the template or remove the fill to clear this refusal',
    ])
  })

  test('writes geometry-only contents list layout for levels one through six', () => {
    const html = bookDocument(Book.parse(input({ frontMatter: [{ kind: 'contents' }] }))).html
    expect(html).toContain(':where(.segnavia-contents-list){list-style:none;padding:0;margin:0}')
    expect(html).toContain(':where(.segnavia-contents-entry){display:flex}')
    expect(html).toContain(':where(.segnavia-contents-page){margin-inline-start:auto}')
    for (let level = 2; level <= 6; level += 1) {
      expect(html).toContain(`:where(.segnavia-contents-entry[data-level="${level}"]){padding-inline-start:${level - 1}em}`)
    }
  })
})
