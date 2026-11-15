import { expect, test } from 'bun:test'
import { hyphenationPoints } from './hyphenate.ts'

test.each([
  ['associate', [2, 4]],
  ['table', [2]],
] as const)('hyphenates %s at its dictionary points', (word, points) => {
  expect(hyphenationPoints(word, 'en-US')).toEqual(points.map((index) => ({ index, hyphen: true })))
})

test('keeps pattern breaks at the 2/3 minimums and suppresses breaks inside them', () => {
  expect(hyphenationPoints('hyphenation', 'en-US')).toEqual([
    { index: 2, hyphen: true },
    { index: 6, hyphen: true },
  ])
  expect(hyphenationPoints('computer', 'en-US')).toEqual([{ index: 3, hyphen: true }])
  expect(hyphenationPoints('abandon', 'en-US')).toEqual([{ index: 4, hyphen: true }])
})

test('matches English by primary language subtag', () => {
  expect(hyphenationPoints('Associate', 'en')).toEqual([
    { index: 2, hyphen: true },
    { index: 4, hyphen: true },
  ])
  expect(hyphenationPoints('table', 'en-GB')).toEqual([{ index: 2, hyphen: true }])
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
  expect(hyphenationPoints('אב־גד', 'he')).toEqual([{ index: 3, hyphen: false }])
  expect(hyphenationPoints('אב־גד', 'zz')).toEqual([{ index: 3, hyphen: false }])
})

test('reports maqaf only when it has a letter on both sides', () => {
  expect(hyphenationPoints('שלום־', 'he')).toEqual([])
  expect(hyphenationPoints('־abc', 'he')).toEqual([])
})
