import { describe, expect, test } from 'bun:test'
import { Book } from '@segnavia/format'
import { bookDocument } from './book-document.ts'
import { BOOK_FLOW_COLUMN_MIN_PX } from './book-flow.ts'

describe('book flow', () => {
  test('shows held pages, responsive columns and continuous notes with the galley positions', () => {
    const book = Book.parse({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { top: 10, bottom: 12, inner: 14, outer: 8 }, columnGap: 6 },
      templates: [{ name: 'lesson', html: '<header data-region="heading"></header><main data-region="reading"></main>' }],
      chapters: [
        { kind: 'designed', pages: [{ html: '<h1>Artwork</h1>' }] },
        { kind: 'templated', template: 'lesson', pages: [{ regions: { heading: '<h1>Lesson</h1>', reading: '<p>Words</p>' } }] },
        { title: 'One', html: '<p data-columns="2">A<span data-note="footnote">note</span></p><p>After</p>' },
      ],
    })
    const galley = bookDocument(book).html
    const flow = bookDocument(book, { galley: false }).html
    const positions = (html: string) => [...html.matchAll(/data-segnavia-position="([^"]+)"/g)].flatMap((match) => (match[1] ? [match[1]] : []))

    expect(flow).toMatch(/<figure[^>]*data-segnavia-designed-page="1"[^>]*data-segnavia-flow-page[^>]*>/)
    expect(flow).toMatch(/<figure[^>]*data-segnavia-templated-page="1"[^>]*data-segnavia-flow-page[^>]*>/)
    expect(flow.match(/<figure[^>]*>/g)?.every((tag) => !tag.includes('hidden'))).toBe(true)
    expect(flow).toContain('<header data-region="heading"><h1>Lesson</h1></header>')
    expect(flow).toContain('<main data-region="reading"><p>Words</p></main>')
    expect(flow).toContain(':where([data-columns="2"]){column-count:2}')
    expect(flow).toContain(`@container (max-width:${2 * BOOK_FLOW_COLUMN_MIN_PX + 6 * (96 / 25.4)}px)`)
    expect(flow).toContain('column-count:1')
    expect(flow).toContain(`column-gap:${6 * (96 / 25.4)}px`)
    expect(flow).toContain('class="segnavia-footnotes"')
    expect(flow).not.toContain('data-segnavia-notes-galley')
    expect(flow).not.toContain('data-segnavia-head')
    expect(flow).not.toContain('data-segnavia-foot')
    expect([...flow.matchAll(/<section[^>]+data-segnavia-flow="([^"]+)"/g)].flatMap((match) => (match[1] ? [match[1]] : []))).toEqual([
      'segnavia-designed-1',
      'segnavia-templated-1',
      'segnavia-chapter-1',
    ])
    expect(positions(flow).filter((position) => !position.endsWith(':footnotes'))).toEqual(positions(galley))
  })
})
