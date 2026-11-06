import { describe, expect, test } from 'bun:test'
import { Book } from './book.ts'
import { physicalMargins } from './margins.ts'

const margin = { blockStart: 1, blockEnd: 2, inlineStart: 3, inlineEnd: 4 }

describe('physicalMargins', () => {
  test.each([
    ['ltr', 'recto', { top: 1, right: 4, bottom: 2, left: 3 }],
    ['ltr', 'verso', { top: 1, right: 3, bottom: 2, left: 4 }],
    ['rtl', 'recto', { top: 1, right: 3, bottom: 2, left: 4 }],
    ['rtl', 'verso', { top: 1, right: 4, bottom: 2, left: 3 }],
  ] as const)('maps %s %s binding and outer margins', (direction, side, expected) => {
    expect(physicalMargins(margin, direction, side)).toEqual(expected)
  })
})

test('content margins require every logical edge and refuse legacy margin names', () => {
  const book = { title: 'Book', mode: 'continuous', chapters: [{ title: 'Chapter', html: '<p>Text</p>' }] }
  expect(() => Book.parse({ ...book, page: { paper: 'a5', margin: { inlineStart: 15 } } })).toThrow('blockStart')
  expect(() => Book.parse({ ...book, page: { paper: 'a5', margin: { top: 12, bottom: 12, inner: 15, outer: 10 } } })).toThrow(
    'use blockStart, blockEnd, inlineStart and inlineEnd to clear this refusal',
  )
})
