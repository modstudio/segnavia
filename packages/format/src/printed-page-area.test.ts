import { describe, expect, test } from 'bun:test'
import { Book } from './book.ts'
import { identifiedBookInput } from './book-test-helper.ts'
import { textArea } from './printed-pages.ts'

describe('textArea', () => {
  test('subtracts the parent margins from the paper', () => {
    const parent = { blockStart: 20, blockEnd: 25, inlineStart: 18, inlineEnd: 12 }
    expect(textArea({ margin: parent }, { width: 148, height: 210 })).toEqual({ width: 118, height: 165 })
  })
})

test('a flowing section refuses parent pages with different text widths', () => {
  const result = Book.safeParse(
    identifiedBookInput({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 15, inlineEnd: 10 } },
      parentPages: [
        { name: 'opening', margin: { blockStart: 30, blockEnd: 10, inlineStart: 20, inlineEnd: 10 } },
        { name: 'body', margin: { blockStart: 10, blockEnd: 10, inlineStart: 25, inlineEnd: 10 } },
      ],
      chapters: [{ title: 'One', html: '<p>Text</p>', parentRules: [{ when: { position: 'sectionFirst' }, parent: 'opening' }, { parent: 'body' }] }],
    }),
  )
  expect(result.success).toBe(false)
  if (!result.success)
    expect(result.error.issues[0]?.message).toContain('the One flow uses parent pages "opening" (118mm) and "body" (113mm) with different text widths')
})

test('every resolved parent page must leave a positive text area', () => {
  const result = Book.safeParse(
    identifiedBookInput({
      title: 'Book',
      mode: 'paginated',
      page: { paper: 'a5', margin: { blockStart: 10, blockEnd: 10, inlineStart: 15, inlineEnd: 10 } },
      parentPages: [{ name: 'closed', margin: { blockStart: 105, blockEnd: 105, inlineStart: 74, inlineEnd: 74 } }],
      chapters: [{ title: 'One', html: '<p>Text</p>' }],
    }),
  )
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      'parent page "closed" has top and bottom margins totaling 210mm on paper 210mm high; reduce the vertical margins to leave a text area',
    )
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      'parent page "closed" has inner and outer margins totaling 148mm on paper 148mm wide; reduce the horizontal margins to leave a text area',
    )
  }
})
