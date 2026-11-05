import { expect, test } from 'bun:test'
import { usesKeepWith } from './book-render.ts'

test('enables the continuous print bridge only when markup or a stylesheet declares a keep', () => {
  expect(usesKeepWith('<span style="--segnavia-keep-with:next">1</span> word')).toBe(true)
  expect(usesKeepWith('<p><span class="seif">1</span> word</p>', '.seif{--segnavia-keep-with:next}')).toBe(true)
  expect(usesKeepWith('<p>ordinary book text</p>', undefined, 'p{margin:0}')).toBe(false)
})
