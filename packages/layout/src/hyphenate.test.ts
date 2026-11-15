import { expect, test } from 'bun:test'
import { hyphenationPoints } from './hyphenate.ts'

test.each([
  ['associate', [2, 4]],
  ['table', [2]],
] as const)('hyphenates %s at its dictionary points', (word, points) => {
  expect(hyphenationPoints(word, 'en-US')).toEqual([...points])
})

test('keeps pattern breaks at the 2/3 minimums and suppresses breaks inside them', () => {
  expect(hyphenationPoints('hyphenation', 'en-US')).toEqual([2, 6])
  expect(hyphenationPoints('computer', 'en-US')).toEqual([3])
})

test('matches English by primary language subtag', () => {
  expect(hyphenationPoints('Associate', 'en')).toEqual([2, 4])
  expect(hyphenationPoints('table', 'en-GB')).toEqual([2])
  expect(hyphenationPoints('present', 'en-US')).toEqual([])
})

test('models Hebrew and Yiddish as languages without pattern hyphenation', () => {
  expect(hyphenationPoints('hyphenation', 'he')).toEqual([])
  expect(hyphenationPoints('hyphenation', 'yi')).toEqual([])
})

test('returns no pattern points for an unsupported language', () => {
  expect(hyphenationPoints('hyphenation', 'fr-FR')).toEqual([])
})

test('reports a break after maqaf without inserting a character', () => {
  expect(hyphenationPoints('אב־גד', 'he')).toEqual([3])
  expect(hyphenationPoints('אב־גד', 'zz')).toEqual([3])
})

test('reports maqaf only when it has a letter on both sides', () => {
  expect(hyphenationPoints('שלום־', 'he')).toEqual([])
  expect(hyphenationPoints('־abc', 'he')).toEqual([])
})
