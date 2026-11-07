import { describe, expect, test } from 'bun:test'
import { Book, bookSections } from './book.ts'

describe('bookSections', () => {
  test('flattens an existing book in reading order without changing its entries', () => {
    const book = Book.parse({
      title: 'Book',
      mode: 'continuous',
      frontMatter: [{ title: 'Preface', html: '<p>Front</p>' }, { kind: 'contents' }],
      chapters: [{ title: 'One', html: '<p>Body</p>' }],
    })

    const sections = bookSections(book)
    expect(sections.map(({ entry: _entry, ...section }) => section)).toEqual([
      { division: 'front', ancestry: [], depth: 0, path: ['frontMatter', 0] },
      { division: 'front', ancestry: [], depth: 0, path: ['frontMatter', 1] },
      { division: 'body', ancestry: [], depth: 0, path: ['body', 0] },
    ])
    expect(sections.map(({ entry }) => entry)).toEqual([...book.frontMatter, ...book.body])
  })

  test('flattens nested parts across all three divisions with ancestry, depth and stable part ids', () => {
    const book = Book.parse({
      title: 'Tree',
      mode: 'continuous',
      frontMatter: [{ title: 'Preface', html: '<p>Front</p>' }],
      body: [
        {
          id: 'first-part',
          name: 'part',
          title: 'First',
          html: '<h1>First</h1>',
          children: [
            { id: 'inner-part', name: 'gate', title: 'Inner', children: [{ title: 'One', html: '<p>Body</p>' }] },
            { title: 'Two', html: '<p>Body</p>' },
          ],
        },
      ],
      endMatter: [{ id: 'appendix-part', name: 'appendix', title: 'Appendix', children: [{ title: 'A', html: '<p>End</p>' }] }],
    })

    expect(bookSections(book).map(({ entry, ...section }) => ({ ...section, title: entry.title }))).toEqual([
      { division: 'front', ancestry: [], depth: 0, path: ['frontMatter', 0], title: 'Preface' },
      { division: 'body', ancestry: [], depth: 0, path: ['body', 0], id: 'first-part', title: 'First' },
      {
        division: 'body',
        ancestry: [{ name: 'part', title: 'First', runningHead: undefined, id: 'first-part' }],
        depth: 1,
        path: ['body', 0, 'children', 0],
        id: 'inner-part',
        title: 'Inner',
      },
      {
        division: 'body',
        ancestry: [
          { name: 'part', title: 'First', runningHead: undefined, id: 'first-part' },
          { name: 'gate', title: 'Inner', runningHead: undefined, id: 'inner-part' },
        ],
        depth: 2,
        path: ['body', 0, 'children', 0, 'children', 0],
        title: 'One',
      },
      {
        division: 'body',
        ancestry: [{ name: 'part', title: 'First', runningHead: undefined, id: 'first-part' }],
        depth: 1,
        path: ['body', 0, 'children', 1],
        title: 'Two',
      },
      { division: 'end', ancestry: [], depth: 0, path: ['endMatter', 0], id: 'appendix-part', title: 'Appendix' },
      {
        division: 'end',
        ancestry: [{ name: 'appendix', title: 'Appendix', runningHead: undefined, id: 'appendix-part' }],
        depth: 1,
        path: ['endMatter', 0, 'children', 0],
        title: 'A',
      },
    ])
  })
})
