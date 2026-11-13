import { describe, expect, test } from 'bun:test'
import { Book } from '@segnavia/format'
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

describe('line-keyed note series document', () => {
  test('builds labels from a lemma without leaving a call', () => {
    const result = bookDocument(
      Book.parse(
        input({
          lineNumbers: {},
          notes: [{ name: 'sources', key: 'line', placement: 'page', numbering: 'book', marker: 'arabic' }],
          body: [
            { id: 'one', ...chapter('One', '<p data-line-numbers>Before <em data-lemma>long lemma</em> <span data-note="sources">body</span> after</p>') },
          ],
        }),
      ),
    )
    expect(result.issues).toEqual([])
    expect(result.html).not.toContain('class="segnavia-note-ref"')
    expect(result.html).toContain('data-segnavia-line-note-anchor="segnavia-note-sources-1"')
    expect(result.html).toContain('data-segnavia-line-note="segnavia-note-sources-1"')
    expect(result.html).toMatch(/<a [^>]*href="#segnavia-note-sources-1"[^>]*tabindex="-1"[^>]*data-segnavia-line-note=/)
    expect(result.html).toContain('<bdi data-segnavia-line-label-number></bdi> <bdi>long lemma</bdi>] </span>body')
  })

  test('keeps a Hebrew lemma separator as plain note-direction text', () => {
    const result = bookDocument(
      Book.parse(
        input({
          lang: 'he',
          lineNumbers: {},
          notes: [{ name: 'sources', key: 'line', placement: 'page', numbering: 'book' }],
          body: [{ id: 'one', ...chapter('א', '<p data-line-numbers dir="rtl">טקסט <em data-lemma>דיבור</em> <span data-note="sources">הערה</span></p>') }],
        }),
      ),
    )
    expect(result.html).toContain('<bdi data-segnavia-line-label-number></bdi> <bdi>דיבור</bdi>] </span>הערה')
    expect(result.html).not.toContain('<bdi>]</bdi>')
  })

  test('omits the lemma and separator when no lemma is authored', () => {
    const result = bookDocument(
      Book.parse(
        input({
          lang: 'he',
          lineNumbers: {},
          notes: [{ name: 'sources', key: 'line', placement: 'page', numbering: 'book' }],
          body: [{ id: 'one', ...chapter('א', '<p data-line-numbers dir="rtl">טקסט <span data-note="sources">הערה</span></p>') }],
        }),
      ),
    )
    expect(result.html).toContain('<bdi data-segnavia-line-label-number></bdi> </span>הערה')
  })

  test('refuses an unnumbered anchor and a repeat reference', () => {
    const result = bookDocument(
      parseBookFixture(
        input({
          lineNumbers: {},
          notes: [{ name: 'sources', key: 'line', placement: 'page', numbering: 'book' }],
          body: [chapter('One', '<p><span id="source" data-note="sources">body</span> <a data-note-ref="source">again</a></p>')],
        }),
      ),
    )
    expect(result.issues).toContainEqual(expect.stringContaining('mark its containing block or container with data-line-numbers'))
    expect(result.issues).toContainEqual(expect.stringContaining('write a separate note at this place or move it to a counter-keyed series'))
  })
})
