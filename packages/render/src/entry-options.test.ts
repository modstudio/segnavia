import { expect, test } from 'bun:test'
import { parsePageImageOptions } from './entry-options.ts'

test.each([0, -1, 1.5, '2', Number.NaN])('pageImage refuses invalid page selector %p', (page) => {
  expect(() => parsePageImageOptions({ page } as never)).toThrow(
    'pageImage options.page needs to be a positive integer; pass a 1-based page number to clear this refusal.',
  )
})

test('pageImage accepts an absent or positive-integer page selector', () => {
  expect(parsePageImageOptions({})).not.toHaveProperty('page')
  expect(parsePageImageOptions({ page: 2 })).toMatchObject({ page: 2 })
})
