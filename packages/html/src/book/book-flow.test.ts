import { describe, expect, test } from 'bun:test'
import { Book, PX_PER_MM } from '@segnavia/format'
import { bookDocument } from './book-document.ts'
import { BOOK_FLOW_COLUMN_MIN_PX, bookBlockPosition, parseBookPositionKey } from './book-flow.ts'

describe('book flow', () => {
  test('reads the position keys written for ordinary and suffixed blocks', () => {
    expect(parseBookPositionKey(bookBlockPosition('chapter:held', 3))).toEqual({ flow: 'chapter:held', index: 3 })
    expect(parseBookPositionKey(bookBlockPosition('chapter:held', 3, 'footnotes'))).toEqual({ flow: 'chapter:held', index: 3, suffix: 'footnotes' })
    expect(parseBookPositionKey('missing-index')).toBeUndefined()
  })
  test('shows held pages, responsive columns and continuous notes with the galley positions', () => {
    const book = Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { top: 10, bottom: 12, inner: 14, outer: 8 }, columnGap: 6 },
      frontMatter: [{ kind: 'contents' }],
      templates: [{ name: 'lesson', html: '<header data-region="heading"></header><main data-region="reading"></main>' }],
      chapters: [
        { kind: 'designed', opens: 'verso', pages: [{ html: '<h1>Artwork</h1>' }, { html: '<p>Back</p>' }] },
        { kind: 'templated', template: 'lesson', pages: [{ regions: { heading: '<h1>Lesson</h1>', reading: '<p>Words</p>' } }] },
        { title: 'One', html: '<style>.opening{font-weight:bold}</style><p data-columns="2">A<span data-note="footnote">note</span></p><p>After</p>' },
      ],
    })
    const galley = bookDocument(book).html
    const flow = bookDocument(book, { build: 'flow' }).html
    const positions = (html: string) => [...html.matchAll(/data-segnavia-position="([^"]+)"/g)].flatMap((match) => (match[1] ? [match[1]] : []))

    expect(flow).toMatch(/<figure[^>]*data-segnavia-designed-page="1"[^>]*data-segnavia-flow-page[^>]*>/)
    expect(flow).toMatch(/<figure[^>]*data-segnavia-templated-page="1"[^>]*data-segnavia-flow-page[^>]*>/)
    expect(flow.match(/<figure[^>]*>/g)?.every((tag) => !tag.includes('hidden'))).toBe(true)
    expect(flow).toContain('<header data-region="heading"><h1 id="segnavia-h-templated-1-1">Lesson</h1></header>')
    expect(flow).toContain('href="#segnavia-h-templated-1-1"')
    expect(flow).toContain('<main data-region="reading"><p>Words</p></main>')
    for (const count of [2, 3, 4]) {
      expect(flow).toContain(`:where([data-columns="${count}"]){column-count:${count}}`)
      expect(flow).toContain(`@container (max-width:${count * BOOK_FLOW_COLUMN_MIN_PX + (count - 1) * 6 * (96 / 25.4)}px)`)
    }
    expect(flow).toContain('column-count:1')
    expect(flow).toContain(`column-gap:${6 * (96 / 25.4)}px`)
    expect(flow).toContain('block-size:calc(100cqi * var(--segnavia-paper-ratio))')
    expect(flow).toContain('zoom:var(--segnavia-flow-scale,calc(100cqi / var(--segnavia-paper-inline)))')
    expect(flow).toContain('block-size:var(--segnavia-text-block);container-type:inline-size}')
    expect(flow).toContain('class="segnavia-footnotes"')
    expect(flow).not.toContain('data-segnavia-notes-galley')
    expect(flow).not.toContain('data-segnavia-head')
    expect(flow).not.toContain('data-segnavia-foot')
    expect([...flow.matchAll(/<section[^>]+data-segnavia-flow="([^"]+)"/g)].flatMap((match) => (match[1] ? [match[1]] : []))).toEqual([
      'segnavia-contents',
      'segnavia-designed-1',
      'segnavia-templated-1',
      'segnavia-chapter-1',
    ])
    expect(flow).toContain('data-segnavia-position="segnavia-chapter-1:1"')
    expect(flow).toContain('data-segnavia-position="segnavia-chapter-1:1:footnotes"')
    expect(flow).toContain('data-segnavia-position="segnavia-chapter-1:2"')
    expect(flow).not.toMatch(/<style[^>]*data-segnavia-position/)
    expect(positions(flow).filter((position) => !position.endsWith(':footnotes'))).toEqual(positions(galley))

    const figures = [...flow.matchAll(/<figure[^>]+style="([^"]+)"/g)].map((match) => match[1])
    const geometry = `--segnavia-paper-inline:${148 * PX_PER_MM}px;--segnavia-paper-block:${210 * PX_PER_MM}px;--segnavia-paper-ratio:${210 / 148};--segnavia-text-inline:${126 * PX_PER_MM}px;--segnavia-text-block:${188 * PX_PER_MM}px;--segnavia-text-block-start:${10 * PX_PER_MM}px;`
    expect(figures[0]).toBe(`${geometry}--segnavia-text-inline-start:${8 * PX_PER_MM}px`)
    expect(figures[1]).toBe(`${geometry}--segnavia-text-inline-start:${14 * PX_PER_MM}px`)
    expect(figures[2]).toBe(`${geometry}--segnavia-text-inline-start:${14 * PX_PER_MM}px`)
  })

  test('refuses flow-only builds for a continuous book by build name', () => {
    const book = Book.parse({ title: 'Book', mode: 'continuous', chapters: [{ title: 'One', html: '<p>Text</p>' }] })
    expect(bookDocument(book, { build: 'galley' }).issues).toContain(
      'a continuous book cannot use the galley build; request the print build, or make the book paginated with a page to clear this',
    )
    expect(bookDocument(book, { build: 'flow' }).issues).toContain(
      'a continuous book cannot use the flow build; request the print build, or make the book paginated with a page to clear this',
    )
  })
})
