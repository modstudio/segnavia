import { describe, expect, test } from 'bun:test'
import { Book, bookSections } from './book.ts'

describe('bookSections', () => {
  test('flattens an existing book in reading order without changing its entries', () => {
    const book = Book.parse({
      title: 'Book',
      mode: 'continuous',
      frontMatter: [
        { id: 'preface', title: 'Preface', html: '<p>Front</p>' },
        { id: 'contents', kind: 'contents' },
      ],
      chapters: [{ id: 'one', title: 'One', html: '<p>Body</p>' }],
    })

    const sections = bookSections(book)
    expect(sections.map(({ entry: _entry, ...section }) => section)).toEqual([
      { division: 'front', ancestry: [], depth: 0, path: ['frontMatter', 0], id: 'preface' },
      { division: 'front', ancestry: [], depth: 0, path: ['frontMatter', 1], id: 'contents' },
      { division: 'body', ancestry: [], depth: 0, path: ['body', 0], id: 'one' },
    ])
    expect(sections.map(({ entry }) => entry)).toEqual([...book.frontMatter, ...book.body])
  })

  test('flattens nested parts across all three divisions with ancestry, depth and stable part ids', () => {
    const book = Book.parse({
      title: 'Tree',
      mode: 'continuous',
      frontMatter: [{ id: 'preface', title: 'Preface', html: '<p>Front</p>' }],
      body: [
        {
          id: 'first-part',
          name: 'part',
          title: 'First',
          html: '<h1>First</h1>',
          children: [
            { id: 'inner-part', name: 'gate', title: 'Inner', children: [{ id: 'one', title: 'One', html: '<p>Body</p>' }] },
            { id: 'two', title: 'Two', html: '<p>Body</p>' },
          ],
        },
      ],
      endMatter: [{ id: 'appendix-part', name: 'appendix', title: 'Appendix', children: [{ id: 'appendix-a', title: 'A', html: '<p>End</p>' }] }],
    })

    expect(bookSections(book).map(({ entry, ...section }) => ({ ...section, title: entry.title }))).toEqual([
      { division: 'front', ancestry: [], depth: 0, path: ['frontMatter', 0], id: 'preface', title: 'Preface' },
      { division: 'body', ancestry: [], depth: 0, path: ['body', 0], id: 'first-part', title: 'First' },
      {
        division: 'body',
        ancestry: [{ name: 'part', title: 'First', id: 'first-part' }],
        depth: 1,
        path: ['body', 0, 'children', 0],
        id: 'inner-part',
        title: 'Inner',
      },
      {
        division: 'body',
        ancestry: [
          { name: 'part', title: 'First', id: 'first-part' },
          { name: 'gate', title: 'Inner', id: 'inner-part' },
        ],
        depth: 2,
        path: ['body', 0, 'children', 0, 'children', 0],
        id: 'one',
        title: 'One',
      },
      {
        division: 'body',
        ancestry: [{ name: 'part', title: 'First', id: 'first-part' }],
        depth: 1,
        path: ['body', 0, 'children', 1],
        id: 'two',
        title: 'Two',
      },
      { division: 'end', ancestry: [], depth: 0, path: ['endMatter', 0], id: 'appendix-part', title: 'Appendix' },
      {
        division: 'end',
        ancestry: [{ name: 'appendix', title: 'Appendix', id: 'appendix-part' }],
        depth: 1,
        path: ['endMatter', 0, 'children', 0],
        id: 'appendix-a',
        title: 'A',
      },
    ])
  })
})
