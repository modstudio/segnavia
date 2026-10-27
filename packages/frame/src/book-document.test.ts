import { describe, expect, test } from 'bun:test'
import { Book, resolveDirection } from '@segnavia/format'
import { paginateScript, planBookPages, printedPageAt } from '@segnavia/html'
import { BOOK_COMPOSER_SCRIPT, bookDocument, PaginatedBookRefusedError } from './book-document.ts'

const book = Book.parse({
  title: 'Book',
  mode: 'paginated',
  lang: 'he',
  page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } },
  chapters: [{ title: 'א', html: '<p>טקסט<span data-note="footnote">הערה</span></p>' }],
})

describe('bookDocument', () => {
  test('embeds the planner, furniture fill and parent-page planner under the bridge nonce', () => {
    const html = bookDocument(book, { nonce: 'held' })
    expect(html.match(/<script nonce="held">/g)?.length).toBeGreaterThanOrEqual(1)
    expect(html).toContain('data-segnavia-galleys')
    expect(html).toContain('data-segnavia-flow="segnavia-chapter-1"')
    expect(html).toContain('data-segnavia-notes-galley')
    expect(html).toContain('"direction":"rtl"')
    expect(BOOK_COMPOSER_SCRIPT).toContain(paginateScript())
    expect(BOOK_COMPOSER_SCRIPT).toContain(printedPageAt.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(planBookPages.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain('paginateBook')
    expect(BOOK_COMPOSER_SCRIPT).toContain('fillBookFurniture')
    expect(BOOK_COMPOSER_SCRIPT).toContain(resolveDirection.toString())
  })

  test('refuses a continuous book and a document with issues', () => {
    const continuous = Book.parse({ title: 'Book', mode: 'continuous', page: book.page, chapters: book.chapters })
    expect(() => bookDocument(continuous, { nonce: 'held' })).toThrow(PaginatedBookRefusedError)
    expect(() => bookDocument(continuous, { nonce: 'held' })).toThrow('mode paginated and page')
    const issues = Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: book.page,
      chapters: [{ title: 'One', html: '<p><span data-note="footnote">f</span><span data-note="endnote">e</span></p>' }],
      footnotes: { marker: 'arabic' },
      endnotes: { marker: 'arabic' },
    })
    expect(() => bookDocument(issues, { nonce: 'held' })).toThrow('footnote and endnote markers are both arabic')
  })

  test('starts at zero height until the composer marks the root', () => {
    const html = bookDocument(book, { nonce: 'held' })
    expect(html).toContain('html:not([data-segnavia-composed])')
    expect(html).toContain('attributeFilter:[name]')
    expect(html).toContain('overflow:clip')
  })
})
