import { expect, test } from 'bun:test'
import { hyphenationPoints } from './hyphenate.ts'

test.each([
  ['hyphenation', [2, 6]],
  ['computer', [3]],
  ['associate', [2, 4]],
  ['table', [2]],
] as const)('hyphenates %s at its dictionary points', (word, points) => {
  expect(hyphenationPoints(word, 'en-US')).toEqual([...points])
})

test('matches English by primary language subtag and preserves the 2/3 minimums', () => {
  expect(hyphenationPoints('Associate', 'en')).toEqual([2, 4])
  expect(hyphenationPoints('table', 'en-GB')).toEqual([2])
  expect(hyphenationPoints('present', 'en-US')).toEqual([])
  expect(hyphenationPoints('aorta', 'en-US').every((point) => point >= 2 && point <= 'aorta'.length - 3)).toBe(true)
})

test('returns no pattern points for unsupported languages', () => {
  expect(hyphenationPoints('hyphenation', 'he')).toEqual([])
  expect(hyphenationPoints('hyphenation', 'fr-FR')).toEqual([])
})

test('reports a break after maqaf without inserting a character', () => {
  const word = 'אב־גד'
  expect(hyphenationPoints(word, 'he')).toEqual([3])
  expect(word).toBe('אב־גד')
})
