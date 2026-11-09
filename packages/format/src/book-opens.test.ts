import { expect, test } from 'bun:test'
import { identifiedBookInput } from './book-test-helper.ts'
import { Book } from './index.ts'

const part = { id: 'part', name: 'part', children: [{ id: 'inside', title: 'Inside', html: '<p>Text</p>' }] }
const input = (opens: 'continue' | 'recto') =>
  identifiedBookInput({
    title: 'Book',
    mode: 'continuous',
    chapters: undefined,
    body: [{ ...part, opens }],
  })

test('keeps continue unavailable to parts', () => {
  expect(Book.safeParse(input('continue')).success).toBe(false)
  expect(Book.safeParse(input('recto')).success).toBe(true)
})
