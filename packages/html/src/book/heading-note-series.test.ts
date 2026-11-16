import { describe, expect, test } from 'bun:test'
import { bookDocument } from './book-document.ts'
import { parseBookFixture } from './book-test-fixture.ts'

const page = { paper: 'a5' as const, margin: { blockStart: 10, blockEnd: 10, inlineStart: 10, inlineEnd: 10 } }
const chapter = (title: string, html: string) => ({ title, html })
const input = (overrides: Record<string, unknown> = {}) => ({ title: 'Book', mode: 'paginated', page, body: [chapter('One', '<p>Text</p>')], ...overrides })
const scopeHeadings = (html: string) => [...html.matchAll(/<p class="segnavia-notes-scope" dir="(?:ltr|rtl)">(.*?)<\/p>/g)].map((match) => match[1])

describe('heading-numbered note series', () => {
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
})
