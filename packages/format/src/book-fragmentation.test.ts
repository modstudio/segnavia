import { describe, expect, test } from 'bun:test'
import { Book, type BookInput, resolveBookPagination } from './index.ts'

const input = (overrides: Partial<BookInput> = {}): BookInput => ({
  title: 'Book',
  mode: 'continuous',
  chapters: [{ title: 'Chapter', html: '<p>Text</p>' }],
  ...overrides,
})

describe('book fragmentation', () => {
  test('defaults to safe, accepts none and refuses other values', () => {
    expect(Book.parse(input()).fragmentation).toBe('safe')
    expect(Book.parse(input({ fragmentation: 'none' })).fragmentation).toBe('none')
    expect(Book.safeParse(input({ fragmentation: 'always' as never })).success).toBe(false)
  })

  test('carries the setting into paginated views', () => {
    const book = Book.parse({
      ...input({ fragmentation: 'none' }),
      mode: 'paginated',
      page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } },
    })
    expect(resolveBookPagination(book)?.fragmentation).toBe('none')
  })
})
