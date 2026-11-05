import { expect, test } from 'bun:test'
import { usesKeepWith } from './book-render.ts'

test('enables the continuous print bridge only for the literal keep-with property', () => {
  expect(usesKeepWith('<span style="--segnavia-keep-with:next">1</span> word')).toBe(true)
  expect(usesKeepWith('<p>ordinary book text</p>')).toBe(false)
})
