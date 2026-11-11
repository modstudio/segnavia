import { expect, test } from 'bun:test'
import { longestTermsFirst } from './lexicon-order.ts'

test('orders terms by code points and keeps equal lengths stable', () => {
  const entries = [
    { term: '𐐷', say: 'astral' },
    { term: 'a', say: 'letter' },
    { term: 'ab', say: 'letters' },
  ]

  expect(longestTermsFirst(entries).map((entry) => entry.term)).toEqual(['ab', '𐐷', 'a'])
})
