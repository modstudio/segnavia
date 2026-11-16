import { describe, expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

const page = { paper: 'a5' as const, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }
const chapter = (title: string, html: string) => ({ title, html })
const input = (overrides: Record<string, unknown> = {}) => ({
  title: 'Book',
  mode: 'paginated',
  page,
  body: [chapter('One', '<p>Text</p>')],
  ...overrides,
})
const scopeHeadings = (html: string) => [...html.matchAll(/<p class="segnavia-notes-scope" dir="(?:ltr|rtl)">(.*?)<\/p>/g)].map((match) => match[1])

describe('note series document', () => {
  test('keeps the established chapter-numbered notes output unchanged', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'book', numbering: 'chapter', marker: 'roman-lower', title: 'Sources' }],
          body: [
            chapter('One', '<p>A<span data-note="sources">first</span><span data-note="sources">second</span></p>'),
            chapter('Two', '<p>B<span data-note="sources">third</span></p>'),
          ],
        }),
      ),
    )
    expect(result.html.match(/id="segnavia-note-sources-[12]-[12]"/g)).toEqual([
      'id="segnavia-note-sources-1-1"',
      'id="segnavia-note-sources-1-2"',
      'id="segnavia-note-sources-2-1"',
    ])
    expect(scopeHeadings(result.html)).toEqual(['One', 'Two'])
  })

  test('restarts and heads book-placed runs at authored headings independently of contents settings', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          contents: { depth: 1 },
          notes: [{ name: 'sources', placement: 'book', numbering: { heading: 2 }, marker: 'arabic', title: 'Sources', contents: false }],
          body: [
            chapter(
              'One',
              '<p>Lead<span data-note="sources">zero</span></p><h2 data-contents="false">First</h2><p>A<span data-note="sources">one</span></p><h3>Nested</h3><p>B<span data-note="sources">two</span></p><h2 lang="he">שני</h2><p>C<span data-note="sources">three</span></p>',
            ),
          ],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html.match(/id="segnavia-note-sources-1-[012]-[12]"/g)).toEqual([
      'id="segnavia-note-sources-1-0-1"',
      'id="segnavia-note-sources-1-1-1"',
      'id="segnavia-note-sources-1-1-2"',
      'id="segnavia-note-sources-1-2-1"',
    ])
    expect(result.html.match(/<p class="segnavia-notes-scope" dir="ltr">One<\/p>/g)).toHaveLength(1)
    expect(result.html).toContain('<p class="segnavia-notes-scope" data-segnavia-scope="heading" dir="ltr">First</p>')
    expect(result.html).toContain('<p class="segnavia-notes-scope" data-segnavia-scope="heading" dir="rtl"><span lang="he" dir="rtl">שני</span></p>')
    expect(result.html).not.toContain('data-segnavia-scope="heading" dir="ltr">Nested')
  })

  test('prints only heading run labels for chapter-placed heading-numbered notes', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'chapter', numbering: { heading: 2 }, marker: 'arabic', title: 'Sources' }],
          body: [chapter('One', '<h2>First</h2><p>A<span data-note="sources">one</span></p>')],
        }),
      ),
    )
    expect(result.html).toContain('<p class="segnavia-notes-scope" data-segnavia-scope="heading" dir="ltr">First</p>')
    expect(result.html).not.toContain('<p class="segnavia-notes-scope" dir="ltr">One</p>')
  })

  test('restarts page footnotes at headings without printing run labels', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          footnotes: { marker: 'arabic', restart: { heading: 2 } },
          body: [chapter('One', '<p>A<span data-note="footnote">lead</span></p><h2>First</h2><p>B<span data-note="footnote">next</span></p>')],
        }),
      ),
    )
    expect(result.html).toContain('id="segnavia-fn-1-0-1"')
    expect(result.html).toContain('id="segnavia-fn-1-1-1"')
    expect(result.html).not.toContain('data-segnavia-scope="heading"')
  })

  test('uses section keys for heading-numbered notes in chapter-zero sections', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'book', numbering: { heading: 2 }, marker: 'arabic' }],
          frontMatter: [
            { id: 'preface', ...chapter('Preface', '<h2>About</h2><p><span data-note="sources">one</span></p>') },
            { id: 'thanks', ...chapter('Thanks', '<h2>People</h2><p><span data-note="sources">two</span></p>') },
          ],
        }),
      ),
    )
    expect(result.html).toContain('id="segnavia-note-sources-preface-1-1"')
    expect(result.html).toContain('id="segnavia-note-sources-thanks-1-1"')
  })

  test('renders Hebrew siman runs with a leading run, group label, unique ids and directed heading labels', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          lang: 'he',
          dir: 'rtl',
          footnotes: { marker: 'arabic', restart: { heading: 2 } },
          notes: [{ name: 'sources', placement: 'book', numbering: { heading: 2 }, marker: 'hebrew', title: 'מקורות' }],
          body: [
            chapter(
              'פרק א',
              '<p>פתיחה<span data-note="sources">מקור אפס</span><span data-note="footnote">הערת אפס</span></p><h2>סימן א</h2><p>טקסט<span data-note="sources">מקור א</span><span data-note="footnote">הערה א</span></p><h2>סימן ב</h2><p>טקסט<span data-note="sources">מקור ב</span></p>',
            ),
          ],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html.match(/id="segnavia-note-sources-1-[012]-1"/g)).toHaveLength(3)
    expect(result.html).toContain('id="segnavia-fn-1-0-1"')
    expect(result.html).toContain('id="segnavia-fn-1-1-1"')
    expect(result.html.match(/<bdi>א<\/bdi>/g)?.length).toBeGreaterThanOrEqual(6)
    expect(result.html.match(/<p class="segnavia-notes-scope" dir="rtl">פרק א<\/p>/g)).toHaveLength(1)
    expect(result.html).toContain('<p class="segnavia-notes-scope" data-segnavia-scope="heading" dir="rtl">סימן א</p>')
    expect(result.html).toContain('<p class="segnavia-notes-scope" data-segnavia-scope="heading" dir="rtl">סימן ב</p>')
  })

  test('writes mixed-language numbering scope headings as directed runs', () => {
    const book = parseBookFixture(
      input({
        notes: [{ name: 'endnote', placement: 'book', numbering: 'chapter' }],
        body: [
          {
            title: [
              { text: 'פרק ', lang: 'he' },
              { text: 'Genesis', lang: 'en' },
            ],
            html: '<p>Text<span data-note="endnote">Source</span></p>',
          },
        ],
      }),
    )
    expect(bookDocument(book).html).toContain(
      '<p class="segnavia-notes-scope" dir="rtl"><span lang="he" dir="rtl">פרק </span><span lang="en" dir="ltr">Genesis</span></p>',
    )
  })

  test('keeps page series in separate declaration-ordered blocks in flow and continuous builds', () => {
    const notes = [{ name: 'commentary', placement: 'page', numbering: 'book', marker: 'roman-lower' }] as const
    const body = [chapter('One', '<p>A<span data-note="commentary">comment</span> B<span data-note="footnote">source</span></p>')]
    const documents = [
      bookDocument(parseBookFixture(input({ notes: [...notes], body })), { build: 'flow' }),
      bookDocument(parseBookFixture(input({ mode: 'continuous', notes: [...notes], body }))),
    ]
    for (const document of documents) {
      const html = document.html
      const footnotes = html.match(/<div class="segnavia-footnotes"[^>]*>(.*?)<\/div>/)?.[1]
      const commentary = html.match(/<div class="segnavia-notes-commentary" data-segnavia-note-series="commentary"[^>]*>(.*?)<\/div>/)?.[1]
      expect(html.indexOf('class="segnavia-footnotes"')).toBeLessThan(html.indexOf('class="segnavia-notes-commentary"'))
      expect(footnotes).toContain('source')
      expect(footnotes).not.toContain('comment')
      expect(commentary).toContain('comment')
      expect(commentary).not.toContain('source')
    }
  })

  test('groups page notes into series galleys in declaration order', () => {
    const book = parseBookFixture(
      input({
        notes: [{ name: 'commentary', placement: 'page', numbering: 'book', marker: 'roman-lower' }],
        body: [
          chapter(
            'One',
            '<p>A<span data-note="commentary">comment</span> B<span data-note="footnote">source</span> C<span data-note="commentary">more</span></p>',
          ),
        ],
      }),
    )
    const html = bookDocument(book).html
    const footnotes = html.match(/<aside data-segnavia-notes-galley data-segnavia-note-series="footnote"[^>]*>(.*?)<\/aside>/)?.[1]
    const commentary = html.match(/<aside data-segnavia-notes-galley data-segnavia-note-series="commentary"[^>]*>(.*?)<\/aside>/)?.[1]
    expect(html.indexOf('data-segnavia-note-series="footnote"')).toBeLessThan(html.indexOf('data-segnavia-note-series="commentary"'))
    expect(footnotes).toContain('source')
    expect(footnotes).not.toContain('comment')
    expect(commentary).toContain('comment')
    expect(commentary).toContain('more')
    expect(commentary).not.toContain('source')
  })

  const headingMatrix = [
    { placement: 'chapter', numbering: 'chapter', headings: ['One', 'Two', 'Three'] },
    { placement: 'chapter', numbering: 'part', headings: [] },
    { placement: 'chapter', numbering: 'book', headings: [] },
    { placement: 'part', numbering: 'chapter', headings: ['One', 'Two', 'Three'] },
    { placement: 'part', numbering: 'part', headings: ['First Part', 'Second Part'] },
    { placement: 'part', numbering: 'book', headings: [] },
    { placement: 'book', numbering: 'chapter', headings: ['One', 'Two', 'Three'] },
    { placement: 'book', numbering: 'part', headings: ['First Part', 'Second Part'] },
    { placement: 'book', numbering: 'book', headings: [] },
  ] as const

  for (const { placement, numbering, headings } of headingMatrix) {
    test(`heads ${placement}-placed notes numbered by ${numbering} by their numbering runs`, () => {
      const note = (body: string) => `<p>Text<span data-note="sources">${body}</span></p>`
      const result = bookDocument(
        parseBookFixture(
          input({
            notes: [{ name: 'sources', placement, numbering, marker: 'roman-lower', title: 'Sources' }],
            body: [
              {
                id: 'first-part',
                name: 'first',
                title: 'First Part',
                children: [chapter('One', note('first')), chapter('Two', note('second'))],
              },
              {
                id: 'second-part',
                name: 'second',
                title: 'Second Part',
                children: [chapter('Three', note('third'))],
              },
            ],
          }),
        ),
      )
      expect(scopeHeadings(result.html)).toEqual([...headings])
    })
  }

  test('uses chapter short titles and resolves each heading direction in a Hebrew book', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          title: 'ספר',
          notes: [{ name: 'sources', placement: 'book', numbering: 'chapter', marker: 'roman-lower', title: 'Sources' }],
          body: undefined,
          chapters: [
            { title: 'פרק ראשון', html: '<p><span data-note="sources">א</span></p>' },
            { title: 'Second Chapter', html: '<p><span data-note="sources">ב</span></p>' },
          ],
        }),
      ),
    )
    expect(result.html).toMatch(/<p class="segnavia-notes-scope" dir="rtl">פרק ראשון<\/p><p class="segnavia-note-sources"/)
    expect(result.html).toMatch(/<p class="segnavia-notes-scope" dir="ltr">Second Chapter<\/p><p class="segnavia-note-sources"/)
    expect(scopeHeadings(result.html)).toEqual(['פרק ראשון', 'Second Chapter'])
  })

  test('uses a part short title for its numbering run', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'book', numbering: 'part', marker: 'roman-lower', title: 'Sources' }],
          body: [
            {
              id: 'first-part',
              name: 'first',
              title: 'First Part',
              children: [chapter('One', '<p><span data-note="sources">first</span></p>')],
            },
          ],
        }),
      ),
    )
    expect(scopeHeadings(result.html)).toEqual(['First Part'])
  })

  test('leaves the shared chapter-zero run of front matter and held sections unheaded', () => {
    const note = (body: string) => `<p>Text<span data-note="sources">${body}</span></p>`
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'book', numbering: 'chapter', marker: 'roman-lower', title: 'Sources' }],
          frontMatter: [chapter('Preface', note('front'))],
          body: [{ kind: 'designed', pages: [{ html: note('held') }] }, chapter('One', note('first'))],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(scopeHeadings(result.html)).toEqual(['One'])
  })

  test('omits a part-numbering heading when the note is outside any part', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'book', numbering: 'part', marker: 'roman-lower', title: 'Sources' }],
          body: [chapter('One', '<p><span data-note="sources">first</span></p>')],
        }),
      ),
    )
    expect(scopeHeadings(result.html)).toEqual([])
  })

  test('places and numbers a series by chapter', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'chapter', numbering: 'chapter', marker: 'roman-lower', title: 'Sources' }],
          body: [chapter('One', '<p>A<span data-note="sources">first</span></p>'), chapter('Two', '<p>B<span data-note="sources">second</span></p>')],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['section-1', 'segnavia-notes-sources-section-1', 'section-2', 'segnavia-notes-sources-section-2'])
    expect(result.html).toContain('id="segnavia-note-sources-1-1"')
    expect(result.html).toContain('id="segnavia-note-sources-2-1"')
    expect(result.html).toMatch(/<p class="segnavia-notes-scope" dir="ltr"[^>]*>One<\/p>/)
    expect(result.html).toMatch(
      /<p class="segnavia-notes-scope" dir="ltr">One<\/p><p class="segnavia-note-sources"[^>]*data-segnavia-position="segnavia-notes-sources-section-1:2"/,
    )
  })

  test('places a part series after the part and restarts its number in the next part', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'part', numbering: 'part', marker: 'roman-lower', title: 'Sources' }],
          body: [
            {
              id: 'first-part',
              name: 'first',
              title: 'First Part',
              children: [chapter('One', '<p>A<span data-note="sources">first</span></p>'), chapter('Two', '<p>B</p>')],
            },
            {
              id: 'second-part',
              name: 'second',
              title: 'Second Part',
              children: [chapter('Three', '<p>C<span data-note="sources">second</span></p>')],
            },
          ],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual([
      'section-1',
      'section-2',
      'segnavia-notes-sources-first-part',
      'section-3',
      'segnavia-notes-sources-second-part',
    ])
    expect(result.html.match(/<bdi>i<\/bdi>/g)).toHaveLength(4)
    expect(result.html).toMatch(/<p class="segnavia-notes-scope" dir="ltr"[^>]*>First Part<\/p>/)
  })

  test('orders book sections by series declaration and numbers each independently', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'book', numbering: 'book', marker: 'roman-lower', title: 'Sources' }],
          body: [chapter('One', '<p>A<span data-note="sources">source</span><span data-note="endnote">comment</span></p>')],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['section-1', 'segnavia-endnotes', 'segnavia-notes-sources'])
    expect(result.html).toContain('id="segnavia-note-sources-1"')
    expect(result.html).toContain('id="segnavia-en-1"')
  })

  test('places a part series at book end when its first note is outside a part', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          notes: [{ name: 'sources', placement: 'part', numbering: 'part', marker: 'roman-lower', title: 'Sources' }],
          body: [chapter('One', '<p>A<span data-note="sources">source</span></p>')],
          endMatter: [chapter('Appendix', '<p>After</p>')],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['section-1', 'segnavia-notes-sources', 'section-2'])
    expect(result.sections[1]?.division).toBe('body')
  })

  test('places collected notes authored in end matter after their owning section', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          endnotes: { placement: 'chapter' },
          endMatter: [chapter('Appendix', '<p>After<span data-note="endnote">end note body</span></p>')],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['section-1', 'section-2', 'segnavia-endnotes-section-2'])
    expect(result.html).toContain('end note body')
    expect(result.html).toContain('id="segnavia-en-1"')
  })

  test('shares chapter-zero numbering across front matter and held sections', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          frontMatter: [chapter('Front', '<p>Front<span data-note="footnote">front note</span></p>')],
          body: [
            { kind: 'designed', pages: [{ html: '<p>First<span data-note="footnote">first held note</span></p>' }] },
            { kind: 'designed', pages: [{ html: '<p>Second<span data-note="footnote">second held note</span></p>' }] },
          ],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html.match(/id="segnavia-fn-0-[123]"/g)).toEqual(['id="segnavia-fn-0-1"', 'id="segnavia-fn-0-2"', 'id="segnavia-fn-0-3"'])
  })

  test('places a chapter-collected section after each held section', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          endnotes: { placement: 'chapter' },
          body: [
            { kind: 'designed', pages: [{ html: '<p>First<span data-note="endnote">first note</span></p>' }] },
            { kind: 'designed', pages: [{ html: '<p>Second<span data-note="endnote">second note</span></p>' }] },
          ],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['section-1', 'segnavia-endnotes-section-1', 'section-2', 'segnavia-endnotes-section-2'])
  })

  test('places front-matter chapter endnotes at book end', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          endnotes: { placement: 'chapter' },
          frontMatter: [chapter('Front', '<p>Front<span data-note="endnote">front note</span></p>')],
        }),
      ),
    )
    expect(result.sections.map(({ id }) => id)).toEqual(['section-1', 'section-2', 'segnavia-endnotes'])
    expect(result.sections[2]?.division).toBe('body')
  })

  test('reuses a note number and body for a later call', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          body: [chapter('One', '<p>A<span id="source-a" data-note="endnote">body</span> B<a data-note-ref="source-a">again</a></p>')],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html.match(/id="segnavia-en-1"/g)).toHaveLength(1)
    expect(result.html.match(/href="#segnavia-en-1"/g)).toHaveLength(2)
    expect(result.html).toContain('data-segnavia-note-repeat')
  })

  test('renders supplied footnote symbols and fixed unnumbered endnotes through the book build', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          footnotes: { marker: { symbols: ['※', '⁂'] }, restart: 'book' },
          endnotes: { marker: { mark: '¤' }, placement: 'book' },
          body: [
            chapter(
              'One',
              '<p><span data-note="footnote">f1</span><span data-note="footnote">f2</span><span data-note="footnote">f3</span><span data-note="endnote">e1</span><span data-note="endnote">e2</span></p>',
            ),
          ],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html.match(/<bdi>※<\/bdi>/g)).toHaveLength(2)
    expect(result.html.match(/<bdi>⁂<\/bdi>/g)).toHaveLength(2)
    expect(result.html.match(/<bdi>※※<\/bdi>/g)).toHaveLength(2)
    expect(result.html.match(/<bdi>¤<\/bdi>/g)).toHaveLength(4)
    expect(result.html).toContain('id="segnavia-en-1"')
    expect(result.html).toContain('id="segnavia-en-2"')
  })

  test('isolates fixed footnotes and supplied endnote symbols in a Hebrew book', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          lang: 'he',
          footnotes: { marker: { mark: '¤' }, restart: 'book' },
          endnotes: { marker: { symbols: ['※', '⁂'] }, placement: 'book' },
          body: [
            chapter(
              'א',
              '<p><span data-note="footnote">מקור א</span><span data-note="footnote">מקור ב</span><span data-note="endnote">הערה א</span><span data-note="endnote">הערה ב</span><span data-note="endnote">הערה ג</span></p>',
            ),
          ],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html.match(/<bdi>¤<\/bdi>/g)).toHaveLength(4)
    expect(result.html.match(/<bdi>※<\/bdi>/g)).toHaveLength(2)
    expect(result.html.match(/<bdi>⁂<\/bdi>/g)).toHaveLength(2)
    expect(result.html.match(/<bdi>※※<\/bdi>/g)).toHaveLength(2)
  })

  test('reports unknown series and forward repeated calls', () => {
    const unknown = bookDocument(parseBookFixture(input({ body: [chapter('One', '<p><span data-note="missing">body</span></p>')] })))
    expect(unknown.issues).toEqual(['data-note names unknown note series missing; declare the series in notes or use a declared series name'])
    const forward = bookDocument(
      parseBookFixture(input({ body: [chapter('One', '<p><a data-note-ref="later">first</a><span id="later" data-note="endnote">body</span></p>')] })),
    )
    expect(forward.issues).toContain('data-note-ref later names no earlier note; place the note before its repeated call')
  })
})
