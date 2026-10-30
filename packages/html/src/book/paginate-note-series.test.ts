import { describe, expect, test } from 'bun:test'
import { block, flow, input, note } from './paginate-book.test-helper.ts'
import { paginateBook } from './paginate-book.ts'

describe('paginateBook note series', () => {
  test('stacks series in declaration order and charges only non-empty group gaps', () => {
    const paragraph = block('text', 'p', 1, 1, 6, 0, {
      footnoteRefs: [
        { note: 'comment', line: 5 },
        { note: 'source', line: 5 },
      ],
    })
    const pages = paginateBook(
      input({
        geometry: {
          textHeight: 120,
          notesGap: 40,
          noteSeries: [
            { name: 'footnote', gap: 10 },
            { name: 'commentary', gap: 20 },
            { name: 'unused', gap: 50 },
          ],
        },
        flows: [flow('c1', 'chapter', [paragraph])],
        notes: [note('source', 1), note('comment', 2, 10, 'commentary')],
      }),
    ).pages
    expect(pages).toHaveLength(1)
    expect(pages[0]?.notes).toEqual([
      { id: 'source', series: 'footnote', whole: true, start: 0, end: 1 },
      { id: 'comment', series: 'commentary', whole: true, start: 0, end: 2 },
    ])
  })

  test('continues a note in the second series within that group', () => {
    const paragraph = block('text', 'p', 1, 1, 1, 0, {
      footnoteRefs: [
        { note: 'source', line: 0 },
        { note: 'comment', line: 0 },
      ],
    })
    const pages = paginateBook(
      input({
        geometry: {
          textHeight: 60,
          notesGap: 9,
          noteSeries: [
            { name: 'footnote', gap: 10 },
            { name: 'commentary', gap: 10 },
          ],
        },
        flows: [flow('c1', 'chapter', [paragraph])],
        notes: [note('source', 1), note('comment', 5, 10, 'commentary')],
      }),
    ).pages
    expect(pages[0]?.notes).toEqual([
      { id: 'source', series: 'footnote', whole: true, start: 0, end: 1 },
      { id: 'comment', series: 'commentary', whole: false, start: 0, end: 2 },
    ])
    expect(pages[1]?.notes).toEqual([{ id: 'comment', series: 'commentary', whole: false, start: 2, end: 5 }])
  })
})
