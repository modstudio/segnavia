import { describe, expect, test } from 'bun:test'
import { type BookDivisions, bookSections } from './book-section.ts'
import { structureNumbers } from './structure-numbers.ts'

const chapter = (id: string, number?: string | number | false) => ({ id, title: id, html: '', ...(number === undefined ? {} : { number }) })
const numbers = (body: BookDivisions['body'], settings: Parameters<typeof structureNumbers>[1] = {}) =>
  structureNumbers(bookSections({ frontMatter: [], body, endMatter: [] }), settings)

describe('structureNumbers', () => {
  test('is opt-in and counts every body section kind except contents, records and number false', () => {
    const held = numbers([
      chapter('one'),
      { id: 'designed', kind: 'designed', contents: true, pages: [{ html: '' }] },
      { id: 'contents', kind: 'contents', contents: true },
      { ...chapter('record'), record: { index: 1, count: 1 }, contents: false },
      chapter('skip', false),
    ])
    expect([...held.values()]).toEqual([
      { level: 'chapter', count: 1 },
      { level: 'chapter', count: 2 },
    ])
  })

  test('continues chapters across parts and applies a restart start value', () => {
    const held = numbers(
      [
        { id: 'a', name: 'a', title: 'A', contents: true, children: [chapter('one')] },
        { id: 'b', name: 'b', title: 'B', contents: true, numbering: { chapters: { restart: 5 } }, children: [chapter('five'), chapter('six')] },
      ],
      { chapters: {} },
    )
    expect(['one', 'five', 'six'].map((id) => held.get(id)?.count)).toEqual([1, 5, 6])
  })

  test('authored text keeps its place and integers use the resolved style', () => {
    const held = numbers([chapter('one', 'A'), chapter('two'), chapter('three', 3)], { chapters: { style: 'roman-upper' } })
    expect(['one', 'two', 'three'].map((id) => held.get(id)?.text)).toEqual(['A', 'II', 'III'])
  })

  test('restarts sub-part counts in each parent', () => {
    const child = (id: string) => ({ id, name: id, title: id, contents: true, children: [] })
    const held = numbers(
      [
        { id: 'a', name: 'a', title: 'A', contents: true, children: [child('a1'), child('a2')] },
        { id: 'b', name: 'b', title: 'B', contents: true, children: [child('b1')] },
      ],
      { parts: {} },
    )
    expect(['a', 'a1', 'a2', 'b', 'b1'].map((id) => held.get(id)?.text)).toEqual(['I', 'I', 'II', 'II', 'I'])
  })

  test('uses nearest styles only within that part and Hebrew defaults include fifteen and sixteen', () => {
    const children = Array.from({ length: 16 }, (_, index) => chapter(`c${index + 1}`))
    const held = numbers(
      [
        { id: 'a', name: 'a', title: 'A', contents: true, numbering: { chapters: { style: 'roman-lower' } }, children: [chapter('inside')] },
        { id: 'b', name: 'b', title: 'B', contents: true, children },
      ],
      { lang: 'he', chapters: {} },
    )
    expect(held.get('inside')?.text).toBe('i')
    expect(held.get('c14')?.text).toBe('טו')
    expect(held.get('c15')?.text).toBe('טז')
  })

  test('inherits outer styles when an inner part sets only restart', () => {
    const held = numbers(
      [
        {
          id: 'outer',
          name: 'outer',
          title: 'Outer',
          contents: true,
          numbering: { parts: { style: 'roman-lower' }, chapters: { style: 'roman-lower' } },
          children: [
            {
              id: 'inner',
              name: 'inner',
              title: 'Inner',
              contents: true,
              numbering: { parts: { restart: 3 }, chapters: { restart: 4 } },
              children: [{ id: 'nested', name: 'nested', title: 'Nested', contents: true, children: [] }, chapter('chapter')],
            },
          ],
        },
      ],
      { parts: { style: 'roman-upper' }, chapters: { style: 'arabic' } },
    )
    expect(held.get('nested')?.text).toBe('iii')
    expect(held.get('chapter')?.text).toBe('iv')
  })
})
