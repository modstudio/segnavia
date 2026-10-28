import { describe, expect, test } from 'bun:test'
import { Book, resolveDirection } from '@segnavia/format'
import {
  heldPageNumber,
  openerPageIndex,
  pageIndexForTarget,
  paginateScript,
  planBookPages,
  printedPageAt,
  selectBookParent,
  windowPageIndex,
} from '@segnavia/html'
import { BOOK_COMPOSER_SCRIPT, bookDocument, bookViewDocument, PaginatedBookRefusedError } from './book-document.ts'

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
    expect(BOOK_COMPOSER_SCRIPT).toContain(selectBookParent.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(planBookPages.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(heldPageNumber.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(windowPageIndex.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(openerPageIndex.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain(pageIndexForTarget.toString())
    expect(BOOK_COMPOSER_SCRIPT).toContain('paginateBook')
    expect(BOOK_COMPOSER_SCRIPT).toContain('fillBookFurniture')
    expect(BOOK_COMPOSER_SCRIPT).toContain('--segnavia-text-height')
    expect(BOOK_COMPOSER_SCRIPT).toContain('data-segnavia-table-header')
    expect(BOOK_COMPOSER_SCRIPT).toContain('for(var w=0;w<page.windows.length;w++)')
    expect(BOOK_COMPOSER_SCRIPT).toContain('flowInlineStart')
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

  test('builds a screen document from a paginated view without changing the print document', () => {
    const view = {
      html: '<main data-segnavia-galleys>Held</main>',
      scripts: 'refuse' as const,
      pagination: {
        paper: { width: 148, height: 210 },
        margin: { top: 12, bottom: 12, inner: 15, outer: 10 },
        columnGap: 4,
        direction: 'rtl' as const,
        numbering: { frontMatter: 'roman-lower' as const, body: 'hebrew' as const },
        rectoOpenings: false,
        orphans: 2,
        widows: 2,
        parents: [],
        endnotePlacement: 'book' as const,
        contents: { pageNumbers: true, depth: 2 },
        runningHead: { recto: 'title' as const, verso: 'title' as const },
      },
    }
    const screen = bookViewDocument(view, { nonce: 'held', screen: { spread: true } })
    const print = bookViewDocument(view, { nonce: 'held' })
    expect(screen).toContain('"screen":{"spread":true}')
    expect(screen).toContain('data-segnavia-spread-blank')
    expect(screen).toContain('data-segnavia-composed-ms')
    expect(print).not.toContain('"screen"')
  })
})
