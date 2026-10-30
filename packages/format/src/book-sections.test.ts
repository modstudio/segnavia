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
      { division: 'body', ancestry: [], depth: 0, path: ['chapters', 0] },
    ])
    expect(sections.map(({ entry }) => entry)).toEqual([...book.frontMatter, ...book.chapters])
  })
})
