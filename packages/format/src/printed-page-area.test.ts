import { describe, expect, test } from 'bun:test'
import { Book } from './book.ts'
import { textArea } from './printed-pages.ts'

describe('textArea', () => {
  test('subtracts the parent margins from the paper', () => {
    const parent = { margin: { top: 20, bottom: 25, inner: 18, outer: 12 } }
    expect(textArea(parent, { width: 148, height: 210 })).toEqual({ width: 118, height: 165 })
  })
})

test('a flowing section refuses parent pages with different text widths', () => {
  const result = Book.safeParse({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { top: 10, bottom: 10, inner: 15, outer: 10 } },
    parentPages: [
      { name: 'opening', margin: { top: 30, bottom: 10, inner: 20, outer: 10 } },
      { name: 'body', margin: { top: 10, bottom: 10, inner: 25, outer: 10 } },
    ],
    chapters: [{ title: 'One', html: '<p>Text</p>', parents: { opener: 'opening', recto: 'body', verso: 'body' } }],
  })
  expect(result.success).toBe(false)
  if (!result.success)
    expect(result.error.issues[0]?.message).toContain('the One flow uses parent pages "opening" (118mm) and "body" (113mm) with different text widths')
})
