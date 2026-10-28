import { expect, test } from 'bun:test'
import { bookPageId } from './book-page-id.ts'

test('formats a two-digit page id from one', () => {
  expect(bookPageId('control-book-en', 1)).toBe('control-book-en/p01')
  expect(bookPageId('control-book-en', 12)).toBe('control-book-en/p12')
})

test('refuses a non-positive page index', () => {
  expect(() => bookPageId('control-book-en', 0)).toThrow('positive integer')
})
